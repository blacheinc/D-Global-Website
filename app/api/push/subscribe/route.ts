import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
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
  return NextResponse.json({ ok: true });
}
