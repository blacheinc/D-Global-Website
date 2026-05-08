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
      // True when this scan attempt did NOT consume a unit because all
      // units on the line item were already admitted. False when this
      // attempt successfully admitted a fresh unit.
      alreadyScanned: boolean;
      scannedAt: string;
      attendee: string;
      tier: string;
      ticketName: string;
      // How many physical tickets this OrderItem represents and how
      // many have been admitted INCLUDING this scan attempt. The
      // scanner UI uses these to render "Admitted 2 of 4" so gate
      // crew can tell at a glance whether more of the group are
      // expected.
      scanCount: number;
      quantity: number;
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
      scanCount: true,
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

  // The QR is shared across every unit on this line item (group
  // purchase: one buyer, N tickets, one QR). Each scan admits a
  // single unit; we increment scanCount and refuse once it has
  // reached `quantity`. updateMany with a guard on scanCount makes
  // the increment atomic against parallel gate-crew scans, count===0
  // means we lost the race or all units were already used.
  const now = new Date();
  let scanCount = item.scanCount;
  let lastScannedAt = item.scannedAt;
  let alreadyScanned = item.scanCount >= item.quantity;

  if (!alreadyScanned) {
    try {
      const result = await db.orderItem.updateMany({
        where: { id: item.id, scanCount: { lt: item.quantity } },
        data: { scanCount: { increment: 1 }, scannedAt: now },
      });
      if (result.count === 0) {
        // Lost the race: another gate crew got the last unit between
        // our read and our write. Re-read so we report accurate state.
        alreadyScanned = true;
        const fresh = await db.orderItem
          .findUnique({
            where: { id: item.id },
            select: { scanCount: true, scannedAt: true },
          })
          .catch(() => null);
        scanCount = fresh?.scanCount ?? item.quantity;
        lastScannedAt = fresh?.scannedAt ?? lastScannedAt;
      } else {
        scanCount = item.scanCount + 1;
        lastScannedAt = now;
      }
    } catch (err) {
      captureError('[scan:verify] scan increment failed', err, {
        orderItemId: item.id,
      });
      // Best-effort fallback: surface what we know from the read.
      alreadyScanned = true;
    }
  }

  return NextResponse.json<ScanResult>({
    ok: true,
    alreadyScanned,
    scannedAt: (lastScannedAt ?? now).toISOString(),
    attendee: item.order.buyerName,
    tier: item.ticketType.tier.replace('_', ' '),
    ticketName: item.ticketType.name,
    scanCount,
    quantity: item.quantity,
  });
}
