import 'server-only';
import webpush from 'web-push';
import { db } from '@/server/db';
import { env } from '@/lib/env';
import { captureError } from '@/server/observability';

// VAPID setup runs once per process. If keys aren't configured, every
// send call is a no-op — the admin UI surfaces the missing config.
let configured = false;
function configure(): boolean {
  if (configured) return true;
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type BroadcastResult = {
  attempted: number;
  delivered: number;
  removed: number;
  failed: number;
};

export async function broadcast(payload: PushPayload): Promise<BroadcastResult> {
  if (!configure()) {
    throw new Error('VAPID keys are not configured.');
  }
  const subs = await db.pushSubscription.findMany();
  const body = JSON.stringify(payload);
  let delivered = 0;
  let removed = 0;
  let failed = 0;

  // Sequential sends keep memory steady when the subscriber list grows;
  // for tens of thousands of subs you'd batch with p-limit instead.
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      );
      delivered += 1;
    } catch (err: unknown) {
      // 404/410 means the subscription is dead at the push service.
      // Anything else is a transient failure — log + count, but keep
      // the row so the next broadcast retries.
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
        removed += 1;
      } else {
        captureError('[push:send] failed', err, { endpoint: sub.endpoint });
        failed += 1;
      }
    }
  }
  return { attempted: subs.length, delivered, removed, failed };
}
