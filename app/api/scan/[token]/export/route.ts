import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isSameOrigin, rateLimit } from '@/server/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Offline-pack export. The scanner page calls this to download every
// valid qrToken for the event in one shot, so the gate-crew device can
// keep working without network. Same security posture as
// /api/scan/[token]/verify: token-gated session, same-origin check, rate
// limited so a leaked link can't be used to enumerate the whole ticket
// list at scale.
//
// Response shape is intentionally narrow: just the data the scanner
// needs to validate a presented QR locally and surface a useful
// admit-result panel. We deliberately omit buyer email / phone, the
// scanner doesn't show them and the lighter payload is a smaller
// surface to leak if the file gets shared.

const PACK_VERSION = 1 as const;

export type OfflinePack = {
  version: typeof PACK_VERSION;
  eventId: string;
  eventTitle: string;
  generatedAt: string;
  // Echo back the session token so the client can scope its local
  // storage keys without re-deriving them.
  tokenSession: string;
  tickets: Array<{
    qrToken: string;
    orderItemId: string;
    attendee: string;
    tier: string;
    ticketName: string;
    quantity: number;
    // Server snapshot of scanCount at pack-generation time. The client
    // tracks deltas locally; effective scanCount = snapshot + localDelta.
    scanCount: number;
  }>;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 });
  }
  // Tighter than verify (120/min): the export pulls the full ticket
  // list per call. 6/min is enough for a gate crew to refresh the pack
  // a few times during the event without burning DB time.
  const rl = rateLimit(req, 'scan-export', 6, 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many export requests. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const { token: sessionToken } = await params;
  const session = await db.eventScanToken.findUnique({
    where: { token: sessionToken },
    select: {
      id: true,
      revokedAt: true,
      expiresAt: true,
      event: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });
  if (
    !session ||
    session.revokedAt ||
    (session.expiresAt && session.expiresAt.getTime() < Date.now())
  ) {
    return NextResponse.json({ error: 'Scanner link is not active.' }, { status: 403 });
  }

  // Pull every PAID OrderItem for the event with a signed qrToken.
  // Refunded / failed orders are excluded so an offline scanner can't
  // accidentally admit a refunded buyer. Comp orders are PAID by
  // design so they make it into the pack.
  const items = await db.orderItem.findMany({
    where: {
      qrToken: { not: null },
      order: {
        eventId: session.event.id,
        status: 'PAID',
      },
    },
    select: {
      qrToken: true,
      id: true,
      quantity: true,
      scanCount: true,
      ticketType: { select: { name: true, tier: true } },
      order: { select: { buyerName: true } },
    },
  });

  const pack: OfflinePack = {
    version: PACK_VERSION,
    eventId: session.event.id,
    eventTitle: session.event.title,
    generatedAt: new Date().toISOString(),
    tokenSession: sessionToken,
    tickets: items
      // qrToken is non-null per the where, but Prisma's type still
      // says nullable. Filter for the type narrowing.
      .filter((it): it is typeof it & { qrToken: string } => it.qrToken !== null)
      .map((it) => ({
        qrToken: it.qrToken,
        orderItemId: it.id,
        attendee: it.order.buyerName,
        tier: it.ticketType.tier.replace('_', ' '),
        ticketName: it.ticketType.name,
        quantity: it.quantity,
        scanCount: it.scanCount,
      })),
  };

  // Suggest a filename so the browser downloads cleanly when the
  // client adds Content-Disposition manually. We return JSON; the
  // client decides whether to read it via fetch or save to disk.
  return NextResponse.json(pack);
}
