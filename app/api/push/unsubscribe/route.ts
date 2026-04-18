import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { captureError } from '@/server/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ endpoint: z.string().url().max(1000) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
  // deleteMany rather than delete so missing rows aren't a 500 — the
  // client may unsubscribe a row that was already pruned by the sender
  // when the push service returned 410.
  try {
    await db.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint } });
  } catch (err) {
    captureError('[api/push/unsubscribe] delete failed', err);
    return NextResponse.json({ error: 'Could not unsubscribe' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
