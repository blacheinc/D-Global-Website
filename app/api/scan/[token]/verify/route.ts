import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { verifyTicket } from '@/server/qr/signPayload';
import { isSameOrigin, rateLimit } from '@/server/rateLimit';
import { captureError } from '@/server/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Gate-crew verification endpoint. The scanner page on /scan/[token]
// POSTs here every time the phone's camera decodes a QR. Two things
// get validated:
//
//   1. The session: <token> must resolve to an active (non-revoked,
//      non-expired) EventScanToken row. An expired/revoked/unknown
//      token gets a 403 so a misplaced scanner URL can't be reused
//      after the event.
//   2. The ticket QR: verifyTicket() checks the HMAC signature and
//      decodes the payload. The payload's eventId must match this
//      token's eventId so a ticket for *another* event scanned at the
//      wrong gate is flagged, not silently accepted.
//
// On success we atomically flip OrderItem.scannedAt. If it was already
// set we return { scanned: true, alreadyScanned: true, scannedAt } so
// the scanner UI can flag a duplicate/repeat entry. Order.status must
// be PAID, refunded/failed orders aren't valid even if the QR was
// previously signed.

const bodySchema = z.object({
  qr: z.string().min(1).max(1000),
});

export type ScanResult =
  | {
      ok: true;
      alreadyScanned: boolean;
      scannedAt: string;
      attendee: string;
      tier: string;
      ticketName: string;
    }
  | {
      ok: false;
      reason:
        | 'invalid-session'
        | 'invalid-qr'
        | 'wrong-event'
        | 'not-paid'
        | 'rate-limited'
        | 'bad-request';
      message: string;
    };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json<ScanResult>(
      { ok: false, reason: 'bad-request', message: 'Cross-origin request rejected' },
      { status: 403 },
    );
  }
  // Rate-limit is generous, a real scanner doing many tickets back-
  // to-back shouldn't hit it, but enough to stop a compromised link
  // being used to brute-force enumerate QR tokens. 120/min/IP.
  const rl = rateLimit(req, 'scan-verify', 120, 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json<ScanResult>(
      { ok: false, reason: 'rate-limited', message: 'Too many scans, wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const { token: sessionToken } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<ScanResult>(
      { ok: false, reason: 'bad-request', message: 'Invalid JSON' },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ScanResult>(
      { ok: false, reason: 'bad-request', message: 'Missing qr' },
      { status: 400 },
    );
  }

  // ---- 1. Session ----
  const session = await db.eventScanToken.findUnique({
    where: { token: sessionToken },
    select: { id: true, eventId: true, revokedAt: true, expiresAt: true },
  });
  if (!session || session.revokedAt || (session.expiresAt && session.expiresAt.getTime() < Date.now())) {
    return NextResponse.json<ScanResult>(
      { ok: false, reason: 'invalid-session', message: 'Scanner link is not active.' },
      { status: 403 },
    );
  }

  // ---- 2. QR payload ----
  const payload = verifyTicket(parsed.data.qr);
  if (!payload) {
    return NextResponse.json<ScanResult>(
      { ok: false, reason: 'invalid-qr', message: 'QR is invalid or has been tampered with.' },
      { status: 200 },
    );
  }
  if (payload.eventId !== session.eventId) {
    return NextResponse.json<ScanResult>(
      { ok: false, reason: 'wrong-event', message: 'This ticket is for a different event.' },
      { status: 200 },
    );
  }

  const item = await db.orderItem.findUnique({
    where: { id: payload.orderItemId },
    select: {
      id: true,
      scannedAt: true,
      quantity: true,
      ticketType: { select: { name: true, tier: true } },
      order: { select: { status: true, buyerName: true } },
    },
  });
  if (!item || item.order.status !== 'PAID') {
    return NextResponse.json<ScanResult>(
      { ok: false, reason: 'not-paid', message: 'Order is not paid or was refunded.' },
      { status: 200 },
    );
  }

  // Flip scannedAt on first scan; reads-then-writes are benign-racy
  // here (two staff both clearing the same QR in the same second would
  // both report alreadyScanned=false) but the write is idempotent via
  // the `{ where: { id, scannedAt: null } }` gate, so only the first
  // one actually sets the timestamp.
  const alreadyScanned = item.scannedAt !== null;
  let effectiveScannedAt = item.scannedAt;
  if (!alreadyScanned) {
    try {
      const updated = await db.orderItem.update({
        where: { id: item.id, scannedAt: null },
        data: { scannedAt: new Date() },
        select: { scannedAt: true },
      });
      effectiveScannedAt = updated.scannedAt;
    } catch (err) {
      // Concurrent gate scan won the race, treat as already-scanned.
      captureError('[scan:verify] scannedAt race', err, {
        orderItemId: item.id,
      });
      const fresh = await db.orderItem
        .findUnique({ where: { id: item.id }, select: { scannedAt: true } })
        .catch(() => null);
      effectiveScannedAt = fresh?.scannedAt ?? new Date();
    }
  }

  return NextResponse.json<ScanResult>({
    ok: true,
    alreadyScanned,
    scannedAt: (effectiveScannedAt ?? new Date()).toISOString(),
    attendee: item.order.buyerName,
    tier: item.ticketType.tier.replace('_', ' '),
    ticketName: item.ticketType.name,
  });
}
