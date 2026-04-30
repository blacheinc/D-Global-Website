'use server';

import { z } from 'zod';
import { OrderStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { captureError } from '@/server/observability';
import { sendOrderConfirmation } from '@/server/email/orderConfirmation';
import { MailProviderUnavailableError } from '@/server/mailer';
import { buildTicketPdf } from '@/server/tickets/ticketPdf';
import { reconcilePaymentWithPaystack } from '@/server/tickets/reconcilePayment';
import { signTicket } from '@/server/qr/signPayload';

// Manual order status override. The Paystack webhook does the happy-path
// flip PENDING → PAID automatically; this action covers the ops
// escape-hatch (refunds via Paystack dashboard + mark REFUNDED here,
// manual resolution of stuck PENDING orders, etc.).
//
// We intentionally don't allow reverting PAID → PENDING from here -
// that would desync the `sold` counter on TicketType (which the webhook
// incremented). Refunds go PAID → REFUNDED.
//
// When status leaves PAID (→ REFUNDED / FAILED / EXPIRED), decrement
// `sold` on each line item's TicketType so the freed capacity returns to
// the tier's inventory. Without this, a refunded order would leave the
// tier permanently showing sold-out even though the QR is invalidated
// (the QR route gates on Order.status === 'PAID'). Conversely, when
// admin manually flips PENDING → PAID (webhook no-show recovery), we
// mirror the webhook's atomic increment.

const statusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

export type OrderStatusResult = { ok: true } | { ok: false; error: string };

export async function updateOrderStatus(
  id: string,
  formData: FormData,
): Promise<OrderStatusResult> {
  await requireAdmin();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: 'Invalid status value.' };
  }

  const order = await db.order.findUnique({
    where: { id },
    select: {
      status: true,
      eventId: true,
      // qrToken is needed so the entering-PAID branch can issue tokens
      // for items that don't have one yet, and skip items that already
      // do (e.g. an order being flipped REFUNDED → PAID after an
      // accidental refund — keep the original tokens so the buyer's
      // existing QR still validates).
      items: { select: { id: true, ticketTypeId: true, quantity: true, qrToken: true } },
    },
  });
  if (!order) return { ok: false, error: 'Order not found.' };

  // Guard rail: refuse PAID → PENDING. The sold-counter side-effect
  // below handles every other direction, but there's no meaningful
  // inventory semantic for "un-pay", the ticket was valid, now it
  // isn't? Use REFUNDED instead.
  if (order.status === 'PAID' && parsed.data.status === 'PENDING') {
    return {
      ok: false,
      error: 'Can’t revert PAID to PENDING, use REFUNDED so the tickets-sold counter stays consistent.',
    };
  }

  // No-op same-state transitions don't need a write (and would wastefully
  // touch every line item's TicketType row).
  if (order.status === parsed.data.status) {
    return { ok: true };
  }

  const leavingPaid = order.status === 'PAID' && parsed.data.status !== 'PAID';
  const enteringPaid = order.status !== 'PAID' && parsed.data.status === 'PAID';

  // When admin manually flips an order into PAID (e.g. recovering a
  // FAILED order after confirming the buyer actually paid, or
  // resolving a webhook no-show), we must mirror everything the
  // webhook does: bump the sold counter AND sign QR tokens. Without
  // the QR step the resend email lands with blank QR slots because
  // buildTicketPdf maps OrderItem.qrToken === null to an empty
  // canvas. Only sign items that don't already have a token so flips
  // through PAID more than once (REFUNDED → PAID, etc.) keep the
  // buyer's original QR working.
  const itemsNeedingTokens = enteringPaid
    ? order.items.filter((item) => !item.qrToken)
    : [];

  try {
    await db.$transaction([
      db.order.update({
        where: { id },
        data: {
          status: parsed.data.status,
          ...(enteringPaid ? { paidAt: new Date() } : {}),
        },
      }),
      ...(leavingPaid
        ? order.items.map((item) =>
            db.ticketType.update({
              where: { id: item.ticketTypeId },
              data: { sold: { decrement: item.quantity } },
            }),
          )
        : []),
      ...(enteringPaid
        ? order.items.map((item) =>
            db.ticketType.update({
              where: { id: item.ticketTypeId },
              data: { sold: { increment: item.quantity } },
            }),
          )
        : []),
      ...itemsNeedingTokens.map((item) =>
        db.orderItem.update({
          where: { id: item.id },
          data: {
            qrToken: signTicket({
              orderItemId: item.id,
              orderId: id,
              eventId: order.eventId,
              issuedAt: Date.now(),
            }),
          },
        }),
      ),
    ]);
  } catch (err) {
    captureError('[admin:updateOrderStatus]', err, { id });
    return { ok: false, error: 'Could not update status. Try again.' };
  }
  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${id}`);
  // Tier's `sold` just changed, the public event page and its /tickets
  // subpage both read remaining capacity (quota - sold) at render time.
  // Revalidate so the checkout surfaces the freed seats right away.
  if (leavingPaid || enteringPaid) {
    const event = await db.event.findUnique({
      where: { id: order.eventId },
      select: { slug: true },
    });
    if (event) {
      revalidatePath(`/events/${event.slug}`);
      revalidatePath(`/events/${event.slug}/tickets`);
    }
    revalidatePath('/events');
    revalidatePath('/');
  }
  return { ok: true };
}

// Admin resend. Re-runs the same PDF + email the webhook fires on a
// fresh payment, so a buyer who deleted their confirmation, never got
// it (spam), or bounces to a new address gets a second copy with
// working QR codes. Only valid on PAID orders — the QR tokens are
// signed at payment time and live on OrderItem.qrToken; a PENDING
// order doesn't have them to send yet.
//
// "RESEND:" subject prefix makes the resend obvious in the buyer's
// inbox so they don't wonder if they've been double-charged.

export type ResendTicketResult = { ok: true } | { ok: false; error: string };

export async function resendTicketEmail(orderId: string): Promise<ResendTicketResult> {
  await requireAdmin();
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { event: true, items: { include: { ticketType: true } } },
  });
  if (!order) return { ok: false, error: 'Order not found.' };
  if (order.status !== 'PAID') {
    return { ok: false, error: 'Only paid orders have tickets to resend.' };
  }
  if (!order.buyerEmail) {
    return { ok: false, error: 'No buyer email on file.' };
  }

  const pdf = await buildTicketPdf(order.id).catch((err) => {
    captureError('[admin:resendTicketEmail] PDF build failed', err, { orderId });
    return null;
  });

  try {
    await sendOrderConfirmation({
      to: order.buyerEmail,
      buyerName: order.buyerName,
      orderId: order.id,
      reference: order.reference,
      totalMinor: order.totalMinor,
      currency: order.currency,
      eventTitle: order.event.title,
      eventStartsAt: order.event.startsAt,
      venueName: order.event.venueName,
      items: order.items.map((i) => ({
        name: i.ticketType.name,
        quantity: i.quantity,
        unitPriceMinor: i.unitPriceMinor,
      })),
      attachments: pdf
        ? [{ filename: pdf.filename, content: pdf.buffer, contentType: 'application/pdf' }]
        : undefined,
      subjectPrefix: 'Resending your tickets for',
    });
  } catch (err) {
    captureError('[admin:resendTicketEmail] send failed', err, { orderId });
    if (err instanceof MailProviderUnavailableError) {
      return {
        ok: false,
        error:
          "Our mail provider (Resend) is having issues right now. The order is fine, nothing was double-charged. Try again in a few minutes.",
      };
    }
    return { ok: false, error: 'Could not send email. Try again.' };
  }
  return { ok: true };
}

// Admin-triggered Paystack recheck. Same code path the buyer-side
// /verify endpoint uses — hits Paystack's /transaction/verify, flips
// the order to PAID if the charge succeeded (and amount matches),
// issues QR tokens, sends the confirmation email with PDF attached.
// Non-PAID terminal states (FAILED / REFUNDED / EXPIRED) get a
// descriptive message without hitting Paystack so ops aren't tricked
// into re-issuing tickets on a refunded order.

export type RecheckPaymentResult = { ok: true; message: string } | { ok: false; error: string };

export async function recheckPaystackStatus(orderId: string): Promise<RecheckPaymentResult> {
  await requireAdmin();
  const outcome = await reconcilePaymentWithPaystack(orderId);

  // Revalidate liberally on any outcome that might have moved the
  // sold counter (now-paid) or the order row (failed). Cheap, keeps
  // the admin UI in sync without the button having to know which
  // paths to poke.
  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderId}`);

  switch (outcome.kind) {
    case 'already-paid':
      return { ok: true, message: 'Order is already PAID — nothing to do.' };
    case 'now-paid': {
      const order = await db.order.findUnique({
        where: { id: orderId },
        select: { eventId: true, event: { select: { slug: true } } },
      });
      if (order?.event) {
        revalidatePath(`/events/${order.event.slug}`);
        revalidatePath(`/events/${order.event.slug}/tickets`);
      }
      revalidatePath('/events');
      revalidatePath('/');
      return {
        ok: true,
        message: 'Paystack confirmed the charge. Order is now PAID; buyer emailed with tickets.',
      };
    }
    case 'still-pending':
      return {
        ok: true,
        message: `Paystack still reports the transaction as ${outcome.upstreamStatus}. Try again in a minute.`,
      };
    case 'failed': {
      const reasons: Record<typeof outcome.reason, string> = {
        'amount-mismatch':
          'Paystack confirmed a charge but the amount did not match the order. Flagged as FAILED for review.',
        declined: 'Paystack declined the charge. Order marked FAILED.',
        reversed: 'Paystack reversed the charge (chargeback). Order marked FAILED.',
        abandoned: 'Buyer abandoned the Paystack checkout without paying. Order marked FAILED.',
      };
      return { ok: true, message: reasons[outcome.reason] };
    }
    case 'terminal':
      return {
        ok: true,
        message: `Order is ${outcome.status}. Use the status selector below if you need to change it.`,
      };
    case 'paystack-error':
      return { ok: false, error: outcome.message };
    default: {
      const _exhaustive: never = outcome;
      return { ok: false, error: 'Unexpected reconcile outcome.' };
    }
  }
}
