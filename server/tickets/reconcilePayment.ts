import 'server-only';
import { db } from '@/server/db';
import { verifyTransaction } from '@/server/paystack/client';
import { signTicket } from '@/server/qr/signPayload';
import { sendOrderConfirmation } from '@/server/email/orderConfirmation';
import { buildTicketPdf } from '@/server/tickets/ticketPdf';
import { captureError } from '@/server/observability';

// One-shot reconcile of an order against Paystack's /transaction/verify.
// Used as a backstop for a webhook that's slow, misrouted, or missing:
//
//   - The buyer-side /api/tickets/[orderId]/verify route calls this while
//     the ticket page polls during the PENDING window (2 minutes after
//     checkout).
//   - The admin "Recheck with Paystack" button on /admin/orders/[id]
//     calls this on demand, so ops can resolve a stuck order without
//     waiting for the buyer to come back.
//
// Idempotent: every write gates on order.status !== 'PAID', so calling
// this when the webhook has already won is a no-op that returns
// { kind: 'already-paid' }. Same fraud posture as the webhook — an
// amount mismatch flags the order FAILED instead of issuing tickets.

export type ReconcileResult =
  | { kind: 'already-paid' }
  | { kind: 'now-paid' }
  | { kind: 'still-pending'; upstreamStatus: string }
  | { kind: 'failed'; reason: 'amount-mismatch' | 'declined' | 'reversed' | 'abandoned' }
  | { kind: 'terminal'; status: 'FAILED' | 'REFUNDED' | 'EXPIRED' }
  | { kind: 'paystack-error'; message: string };

export async function reconcilePaymentWithPaystack(orderId: string): Promise<ReconcileResult> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { kind: 'paystack-error', message: 'Order not found.' };

  if (order.status === 'PAID') return { kind: 'already-paid' };
  // REFUNDED / FAILED / EXPIRED are terminal from our side — Paystack
  // might still report 'success' on the underlying transaction but
  // re-issuing tickets would desync the sold counter (the admin took
  // an action to move us out of PAID). Surface the terminal state to
  // the caller without hitting Paystack.
  if (order.status !== 'PENDING') {
    return { kind: 'terminal', status: order.status };
  }

  let verifyResult;
  try {
    verifyResult = await verifyTransaction(order.reference);
  } catch (err) {
    captureError('[reconcilePayment] paystack verify failed', err, {
      orderId,
      reference: order.reference,
    });
    const message = err instanceof Error ? err.message : 'Paystack verify failed.';
    return { kind: 'paystack-error', message };
  }

  const upstreamStatus = verifyResult.data.status;
  if (upstreamStatus !== 'success') {
    // Paystack statuses we care about:
    //   'pending' — still settling (usually 3DS in progress)
    //   'failed' — declined at the gateway / issuer
    //   'reversed' — chargeback
    //   'abandoned' — user closed the checkout without completing
    // Only 'pending' is a retry-later; everything else is terminal for
    // this attempt. Map to a FAILED order locally so inventory frees up.
    if (upstreamStatus === 'pending') {
      return { kind: 'still-pending', upstreamStatus };
    }
    const reason =
      upstreamStatus === 'failed'
        ? 'declined'
        : upstreamStatus === 'reversed'
          ? 'reversed'
          : 'abandoned';
    await db.order
      .update({
        where: { id: order.id, status: 'PENDING' },
        data: { status: 'FAILED', paystackPayload: verifyResult as unknown as object },
      })
      .catch((err) =>
        captureError('[reconcilePayment] failed to mark order FAILED after terminal Paystack status', err, {
          orderId,
          reference: order.reference,
          upstreamStatus,
        }),
      );
    return { kind: 'failed', reason: reason as 'declined' | 'reversed' | 'abandoned' };
  }

  if (verifyResult.data.amount !== order.totalMinor) {
    // Same fraud posture as the webhook: paid amount doesn't match
    // what we repriced → mark FAILED, don't issue tickets.
    await db.order
      .update({
        where: { id: order.id },
        data: { status: 'FAILED', paystackPayload: verifyResult as unknown as object },
      })
      .catch((err) =>
        captureError('[reconcilePayment] failed to mark order FAILED on amount mismatch', err, {
          orderId,
          reference: order.reference,
        }),
      );
    return { kind: 'failed', reason: 'amount-mismatch' };
  }

  // Atomic flip. The { status: 'PENDING' } gate on the order.update is
  // how we stay safe if the webhook arrived between the findUnique and
  // the transaction — whoever wins the race owns the side effects and
  // the loser gets a P2025 which we swallow.
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
    captureError('[reconcilePayment] flip to PAID failed', err, {
      orderId,
      reference: order.reference,
    });
    const fresh = await db.order
      .findUnique({ where: { id: orderId }, select: { status: true } })
      .catch(() => null);
    if (fresh?.status === 'PAID') return { kind: 'already-paid' };
    return {
      kind: 'paystack-error',
      message: 'Paystack confirmed the charge but saving the ticket failed. Retry in a moment.',
    };
  }

  // Confirmation email + PDF. Best-effort, same pattern as the webhook.
  try {
    const fresh = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { event: true, items: { include: { ticketType: true } } },
    });
    const pdf = await buildTicketPdf(fresh.id).catch((err) => {
      captureError('[reconcilePayment] ticket PDF build failed', err, {
        orderId: fresh.id,
        reference: fresh.reference,
      });
      return null;
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
      attachments: pdf
        ? [{ filename: pdf.filename, content: pdf.buffer, contentType: 'application/pdf' }]
        : undefined,
    });
  } catch (err) {
    captureError('[reconcilePayment] order confirmation email failed', err, {
      orderId: order.id,
      reference: order.reference,
    });
  }

  return { kind: 'now-paid' };
}
