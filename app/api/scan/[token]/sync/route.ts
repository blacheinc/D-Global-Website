import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { isSameOrigin, rateLimit } from '@/server/rateLimit';
import { captureError } from '@/server/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Batch sync of offline scans. The scanner client buffers each
// successful local match into a pending queue; when network returns,
// or the operator clicks "Sync now", the queue is POSTed here. We
// apply each entry through the same atomic increment the live verify
// route uses, so the canonical scanCount on the server matches the
// effective scanCount the offline UI showed (capped at quantity).
//
// Idempotency: each entry carries a client-generated nonce. If two
// retries land back-to-back, the server still applies the increment
// twice unless we track nonces, but the WHERE-clause on scanCount <
// quantity caps the damage at the unit count. Acceptable for v1 and
// matches how the live verify route handles double-tap UI clicks.

const itemSchema = z.object({
  orderItemId: z.string().min(1).max(40),
  // ISO-8601; client uses Date.now() at scan time.
  scannedAt: z.string().datetime().optional(),
  // Idempotency hint, currently surfaced in capture telemetry but
  // not used as a hard dedupe gate (would need a nonce-store table).
  nonce: z.string().min(1).max(80).optional(),
});

const bodySchema = z.object({
  // Cap batch size so a runaway client retry can't pin a Vercel
  // function processing thousands of scans in a single call. 200 covers
  // a busy night without straining a serverless handler.
  scans: z.array(itemSchema).min(1).max(200),
});

export type SyncResultEntry =
  | {
      orderItemId: string;
      kind: 'admitted';
      scanCount: number;
      quantity: number;
      scannedAt: string;
    }
  | {
      orderItemId: string;
      kind: 'already-full';
      scanCount: number;
      quantity: number;
    }
  | {
      orderItemId: string;
      kind: 'not-found';
    }
  | {
      orderItemId: string;
      kind: 'not-paid';
    }
  | {
      orderItemId: string;
      kind: 'wrong-event';
    };

export type SyncResult = {
  ok: true;
  results: SyncResultEntry[];
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 });
  }
  // Same posture as scan-verify: 120 syncs/min/IP. A typical sync is
  // a single batch call, not many; 120 leaves headroom for retries.
  const rl = rateLimit(req, 'scan-sync', 120, 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many sync requests. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const { token: sessionToken } = await params;
  const session = await db.eventScanToken.findUnique({
    where: { token: sessionToken },
    select: { id: true, eventId: true, revokedAt: true, expiresAt: true },
  });
  if (
    !session ||
    session.revokedAt ||
    (session.expiresAt && session.expiresAt.getTime() < Date.now())
  ) {
    return NextResponse.json({ error: 'Scanner link is not active.' }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid sync payload' }, { status: 400 });
  }

  const results: SyncResultEntry[] = [];
  for (const entry of parsed.data.scans) {
    try {
      const item = await db.orderItem.findUnique({
        where: { id: entry.orderItemId },
        select: {
          id: true,
          scanCount: true,
          quantity: true,
          order: { select: { eventId: true, status: true } },
        },
      });
      if (!item) {
        results.push({ orderItemId: entry.orderItemId, kind: 'not-found' });
        continue;
      }
      if (item.order.status !== 'PAID') {
        results.push({ orderItemId: entry.orderItemId, kind: 'not-paid' });
        continue;
      }
      if (item.order.eventId !== session.eventId) {
        // Pack from a different event somehow ended up in this sync
        // call. Don't admit — the scan-token is event-bound.
        results.push({ orderItemId: entry.orderItemId, kind: 'wrong-event' });
        continue;
      }
      if (item.scanCount >= item.quantity) {
        results.push({
          orderItemId: entry.orderItemId,
          kind: 'already-full',
          scanCount: item.scanCount,
          quantity: item.quantity,
        });
        continue;
      }
      const scannedAt = entry.scannedAt ? new Date(entry.scannedAt) : new Date();
      const upd = await db.orderItem.updateMany({
        where: { id: item.id, scanCount: { lt: item.quantity } },
        data: { scanCount: { increment: 1 }, scannedAt },
      });
      if (upd.count === 0) {
        // Lost the race against another scanner. Re-read for accurate
        // state; report already-full.
        const fresh = await db.orderItem
          .findUnique({
            where: { id: item.id },
            select: { scanCount: true },
          })
          .catch(() => null);
        results.push({
          orderItemId: entry.orderItemId,
          kind: 'already-full',
          scanCount: fresh?.scanCount ?? item.quantity,
          quantity: item.quantity,
        });
        continue;
      }
      results.push({
        orderItemId: entry.orderItemId,
        kind: 'admitted',
        scanCount: item.scanCount + 1,
        quantity: item.quantity,
        scannedAt: scannedAt.toISOString(),
      });
    } catch (err) {
      captureError('[scan:sync] entry failed', err, {
        orderItemId: entry.orderItemId,
        nonce: entry.nonce,
      });
      // Treat as not-found so the client retries on next sync.
      results.push({ orderItemId: entry.orderItemId, kind: 'not-found' });
    }
  }

  const body: SyncResult = { ok: true, results };
  return NextResponse.json(body);
}
