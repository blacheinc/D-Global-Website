import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { auth } from '@/auth';
import { captureError } from '@/server/observability';

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
  const session = await auth();
  const userAgent = req.headers.get('user-agent')?.slice(0, 240);
  // upsert on endpoint: re-subscribing on the same browser shouldn't
  // create dupes, but updating keys/userAgent matters because browsers
  // can rotate keys when the user clears site data.
  try {
    await db.pushSubscription.upsert({
      where: { endpoint: parsed.data.endpoint },
      create: {
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent,
        userId: session?.user?.id,
      },
      update: {
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent,
        userId: session?.user?.id,
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
