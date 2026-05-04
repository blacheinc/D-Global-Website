import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { isSameOrigin, rateLimit } from '@/server/rateLimit';
import { ticketRefMatches } from '@/lib/ticketAccess';
import { reconcilePaymentWithPaystack } from '@/server/tickets/reconcilePayment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Buyer-facing backstop for the Paystack webhook. The ticket page
// polls this while Order.status === 'PENDING' so a slow / misrouted /
// absent webhook doesn't leave the buyer staring at a pending state.
// All the reconcile logic lives in server/tickets/reconcilePayment.ts
// so the admin "Recheck with Paystack" button runs the same code path.
//
// Safety:
//   - Same-origin + rate-limited (client polls, so we don't want the
//     endpoint open to scripted enumeration).
//   - Reference in body is a capability token, without it, an
//     attacker who learned an orderId can't force Paystack calls
//     against another buyer's order.
//   - 404 on reference mismatch so a real-vs-fake order can't be
//     distinguished by response shape.

const bodySchema = z.object({
  reference: z.string().trim().min(1).max(128),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 });
  }
  const rl = rateLimit(req, 'ticket-verify', 30, 5 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many status checks. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing reference' }, { status: 400 });
  }

  const { orderId } = await params;
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { reference: true, status: true },
  });
  if (!order || !ticketRefMatches(order.reference, parsed.data.reference)) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const outcome = await reconcilePaymentWithPaystack(orderId);
  // The poller only cares whether the order is now PAID, so collapse
  // the richer reconcile result to the DB's status enum. If the flip
  // failed mid-write the reconcile layer already logged to Sentry;
  // return PENDING so the client keeps polling a few more ticks.
  switch (outcome.kind) {
    case 'already-paid':
    case 'now-paid':
      return NextResponse.json({ status: 'PAID' });
    case 'failed':
      return NextResponse.json({ status: 'FAILED' });
    case 'terminal':
      return NextResponse.json({ status: outcome.status });
    case 'still-pending':
    case 'paystack-error':
    default:
      return NextResponse.json({ status: 'PENDING' });
  }
}
