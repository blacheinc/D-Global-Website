import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { captureError } from '@/server/observability';
import { isSameOrigin, rateLimit } from '@/server/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(200),
  }),
});

export async function POST(req: Request) {
  // CSRF defense: this endpoint is only meant to be hit from our own
  // SubscribeButton (page context) or from the service worker's
  // pushsubscriptionchange handler (SW context, same origin). Blocking
  // cross-origin POSTs closes the "visit attacker.com while signed in
  // and get silently re-subscribed to their VAPID key" hole.
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 });
  }
  // 20 subscribe attempts per 10 minutes per IP is well above the
  // realistic "user clicks, grants perm, SW re-subscribes on rotation"
  // traffic for a single device, and low enough to blunt a scripted
  // row-inflation attack on PushSubscription.
  const rl = rateLimit(req, 'push-subscribe', 20, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }
  const userAgent = req.headers.get('user-agent')?.slice(0, 240);
  // upsert on endpoint: re-subscribing on the same browser shouldn't
  // create dupes, but updating keys/userAgent matters because browsers
  // can rotate keys when the user clears site data.
  //
  // We used to also link the subscription to the signed-in user via
  // NextAuth's `auth()`. Dropped because (a) the linkage wasn't load-
  // bearing — broadcasts go to every row regardless of userId, and the
  // SW's own `pushsubscriptionchange` re-subscribe has no session
  // anyway, so anonymous rows were already the common case — and (b)
  // next-auth beta.22's sync headers() call triggers a Next 15 dynamic-
  // IO warning in dev that clutters the console for every subscribe.
  // If we later need per-user subscription management, match on
  // endpoint from an authenticated endpoint instead of backfilling here.
  try {
    await db.pushSubscription.upsert({
      where: { endpoint: parsed.data.endpoint },
      create: {
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent,
      },
      update: {
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent,
      },
    });
  } catch (err) {
    // Capture so we know if the push pipeline is silently failing at
    // the storage layer — without this, every SubscribeButton click
    // would surface a generic "Couldn't enable notifications" from the
    // client's Sentry tag but the root cause (DB, unique constraint,
    // etc.) would be invisible on the server.
    captureError('[api/push/subscribe] upsert failed', err, {
      endpointHost: safeHost(parsed.data.endpoint),
    });
    return NextResponse.json({ error: 'Could not save subscription' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// URL.host is enough context for Sentry (fcm.googleapis.com vs
// updates.push.services.mozilla.com) without leaking the per-browser
// endpoint token.
function safeHost(endpoint: string): string | undefined {
  try {
    return new URL(endpoint).host;
  } catch {
    return undefined;
  }
}
