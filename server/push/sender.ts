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

// 48h is long enough that a subscriber who opens their phone the next
// morning still sees a "doors open tonight" alert, but short enough that
// a week-old announcement doesn't ambush someone returning from a trip.
// Without this, FCM/Mozilla default up to 4 weeks of queuing.
const TTL_SECONDS = 60 * 60 * 48;

// Cap concurrent push sends. Each send is an HTTP round-trip to FCM /
// Mozilla / Apple; running them sequentially turns ~200 subscribers into
// ~40 seconds of wall time — uncomfortably close to Vercel's default
// 60s server-action budget. Ten parallel is well within what the push
// services accept and keeps a thousand subs under ~20s.
const CONCURRENCY = 10;

export async function broadcast(payload: PushPayload): Promise<BroadcastResult> {
  if (!configure()) {
    throw new Error('VAPID keys are not configured.');
  }
  const subs = await db.pushSubscription.findMany();
  const body = JSON.stringify(payload);
  let delivered = 0;
  let removed = 0;
  let failed = 0;

  async function sendOne(sub: (typeof subs)[number]): Promise<void> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: TTL_SECONDS },
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
        // Only the endpoint's host lands in Sentry — the full URL carries
        // the push-service-assigned per-browser token, which functions as
        // a replay credential. Host alone (fcm.googleapis.com vs
        // updates.push.services.mozilla.com) is enough to tell which
        // service is flaking.
        captureError('[push:send] failed', err, { endpointHost: safeHost(sub.endpoint) });
        failed += 1;
      }
    }
  }

  // Chunked parallelism rather than unbounded Promise.all so we don't
  // open a thousand sockets at once on a large subscriber list.
  for (let i = 0; i < subs.length; i += CONCURRENCY) {
    await Promise.all(subs.slice(i, i + CONCURRENCY).map(sendOne));
  }
  return { attempted: subs.length, delivered, removed, failed };
}

function safeHost(endpoint: string): string | undefined {
  try {
    return new URL(endpoint).host;
  } catch {
    return undefined;
  }
}
