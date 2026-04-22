import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { verifyTransaction } from '@/server/paystack/client';
import { signTicket } from '@/server/qr/signPayload';
import { sendOrderConfirmation } from '@/server/email/orderConfirmation';
import { captureError } from '@/server/observability';
import { isSameOrigin, rateLimit } from '@/server/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Active status check. The Paystack webhook is still the canonical
// source of truth for flipping Order.status → PAID, but this endpoint
// exists as a backstop so a user who returns to the ticket page doesn't
// sit on a PENDING state waiting for a webhook that's slow / misrouted /
// blocked by a misconfigured dashboard URL. Behaviour:
//
//   1. Find the Order. If it's already PAID (webhook beat us here) just
//      return the current state — no Paystack call, so this is cheap to
//      poll from the client.
//   2. Otherwise GET /transaction/verify/<ref> on Paystack. If Paystack
//      confirms the charge and the amount matches, run the same
//      transaction the webhook runs: flip status, sign QR tokens,
//      increment sold counters. On amount mismatch we flag the order
//      FAILED with the same reasoning as the webhook.
//   3. Return the post-update status so the client knows whether to
//      re-render with QR codes or keep polling.
//
// Safety:
//   - Same-origin only + rate-limited (the ticket page client polls;
//     we don't want this open to scripted enumeration of order IDs).
//   - Inventory writes are idempotent: the DB gate on order.status !== 'PAID'
//     ensures we never double-flip if the webhook arrives between the
//     find-order and the transaction.

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

  const { orderId } = await params;
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  // Fast path: the webhook already won. No Paystack round-trip needed.
  if (order.status === 'PAID') {
    return NextResponse.json({ status: 'PAID' });
  }
  // Terminal non-paid states: no point asking Paystack again.
  if (order.status !== 'PENDING') {
    return NextResponse.json({ status: order.status });
  }

  let verifyResult;
  try {
    verifyResult = await verifyTransaction(order.reference);
  } catch (err) {
    captureError('[ticket-verify] paystack verify failed', err, {
      orderId,
      reference: order.reference,
    });
    return NextResponse.json({ status: 'PENDING' });
  }

  const paystackStatus = verifyResult.data.status;
  // Paystack's transaction.status is 'success' for fully-captured,
  // 'pending' while still settling, 'failed' for declines / refunds.
  if (paystackStatus !== 'success') {
    return NextResponse.json({ status: 'PENDING' });
  }

  if (verifyResult.data.amount !== order.totalMinor) {
    // Mirror the webhook's fraud-ish posture: paid amount doesn't match
    // our repriced total → mark FAILED, don't issue tickets.
    await db.order
      .update({
        where: { id: order.id },
        data: { status: 'FAILED', paystackPayload: verifyResult as unknown as object },
      })
      .catch((err) =>
        captureError('[ticket-verify] failed to mark order FAILED on amount mismatch', err, {
          orderId,
          reference: order.reference,
        }),
      );
    return NextResponse.json({ status: 'FAILED' });
  }

  // Same write the webhook does. Status guard prevents a race between
  // this endpoint and the webhook from double-incrementing `sold`.
  try {
    await db.$transaction([
      db.order.update({
        where: { id: order.id, status: 'PENDING' },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paystackPayload: verifyResult as unknown as object,
        },
      }),
      ...order.items.map((item) =>
        db.orderItem.update({
          where: { id: item.id },
          data: {
            qrToken: signTicket({
              orderItemId: item.id,
              orderId: order.id,
              eventId: order.eventId,
              issuedAt: Date.now(),
            }),
          },
        }),
      ),
      ...order.items.map((item) =>
        db.ticketType.update({
          where: { id: item.ticketTypeId },
          data: { sold: { increment: item.quantity } },
        }),
      ),
    ]);
  } catch (err) {
    // P2025 "Record to update not found" happens if the webhook flipped
    // the row to PAID between our findUnique and this update — fine,
    // whoever got there first owns the side effects.
    captureError('[ticket-verify] flip to PAID failed', err, {
      orderId,
      reference: order.reference,
    });
    const fresh = await db.order
      .findUnique({ where: { id: orderId }, select: { status: true } })
      .catch(() => null);
    return NextResponse.json({ status: fresh?.status ?? 'PENDING' });
  }

  // Confirmation email. Best-effort, same pattern as the webhook.
  try {
    const fresh = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { event: true, items: { include: { ticketType: true } } },
    });
    await sendOrderConfirmation({
      to: fresh.buyerEmail,
      buyerName: fresh.buyerName,
      orderId: fresh.id,
      reference: fresh.reference,
      totalMinor: fresh.totalMinor,
      currency: fresh.currency,
      eventTitle: fresh.event.title,
      eventStartsAt: fresh.event.startsAt,
      venueName: fresh.event.venueName,
      items: fresh.items.map((i) => ({
        name: i.ticketType.name,
        quantity: i.quantity,
        unitPriceMinor: i.unitPriceMinor,
      })),
    });
  } catch (err) {
    captureError('[ticket-verify] order confirmation email failed', err, {
      orderId: order.id,
      reference: order.reference,
    });
  }

  return NextResponse.json({ status: 'PAID' });
}
