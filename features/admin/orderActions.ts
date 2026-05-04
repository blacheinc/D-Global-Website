'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { OrderStatus, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { captureError } from '@/server/observability';
import { sendOrderConfirmation } from '@/server/email/orderConfirmation';
import { MailProviderUnavailableError } from '@/server/mailer';
import { buildTicketPdf } from '@/server/tickets/ticketPdf';
import { reconcilePaymentWithPaystack } from '@/server/tickets/reconcilePayment';
import { signTicket } from '@/server/qr/signPayload';
import { isStrictEmail } from '@/lib/email';

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
      // accidental refund, keep the original tokens so the buyer's
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
    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          status: parsed.data.status,
          ...(enteringPaid ? { paidAt: new Date() } : {}),
        },
      });

      if (leavingPaid) {
        for (const item of order.items) {
          await tx.ticketType.update({
            where: { id: item.ticketTypeId },
            data: { sold: { decrement: item.quantity } },
          });
        }
      }

      if (enteringPaid) {
        // Atomic capacity gate per tier. Without the conditional,
        // two concurrent admin flips of different orders that touch
        // the same tier could both see "X seats left", both
        // increment, and oversell. updateMany returns count===0 if
        // sold has moved past the threshold underneath us; throw
        // CapacityRaceError so the outer catch surfaces a friendly
        // message and the transaction rolls back.
        for (const item of order.items) {
          const tt = await tx.ticketType.findUnique({
            where: { id: item.ticketTypeId },
            select: { name: true, quota: true },
          });
          if (!tt) {
            throw new Error('Ticket type vanished mid-transaction');
          }
          const inc = await tx.ticketType.updateMany({
            where: {
              id: item.ticketTypeId,
              sold: { lte: tt.quota - item.quantity },
            },
            data: { sold: { increment: item.quantity } },
          });
          if (inc.count === 0) {
            throw new CapacityRaceError(tt.name);
          }
        }
      }

      for (const item of itemsNeedingTokens) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            qrToken: signTicket({
              orderItemId: item.id,
              orderId: id,
              eventId: order.eventId,
              issuedAt: Date.now(),
            }),
          },
        });
      }
    });
  } catch (err) {
    if (err instanceof CapacityRaceError) {
      return {
        ok: false,
        error: `${err.tierName} is full, can't flip this order to PAID without overselling. Refund a ${err.tierName} order or raise the quota first.`,
      };
    }
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
// working QR codes. Only valid on PAID orders, the QR tokens are
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
// /verify endpoint uses, hits Paystack's /transaction/verify, flips
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
      return { ok: true, message: 'Order is already PAID, nothing to do.' };
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

// Thrown inside an interactive transaction when a conditional sold
// increment finds the row already at or above quota, i.e. another
// transaction beat us to the seat under READ COMMITTED. The outer
// catch in each calling action turns this into a friendly capacity
// error for the admin UI.
class CapacityRaceError extends Error {
  constructor(public readonly tierName: string) {
    super(`CAPACITY_RACE:${tierName}`);
    this.name = 'CapacityRaceError';
  }
}

// Issue complimentary tickets for an event. Used for press, guests of
// the talent, owner gifts, etc. Creates an Order in PAID state with
// totalMinor=0 + isComplimentary=true, signs QR tokens like the
// webhook would, increments the tier's sold counter (comps consume
// real seats, the door doesn't care that the buyer didn't pay), and
// emails the recipient the same PDF a paid buyer receives. The
// confirmation subject is prefixed so the recipient knows it's a
// gift, not something they were charged for.
//
// Capacity check is the same one the user-side checkout enforces:
// quota - sold - pending-reservations >= requested. Comps go straight
// to PAID so they don't add to the pending reservation pool, but the
// tier's quota is still the hard limit. Refusing here is friendlier
// than landing the buyer at the door with a quota mismatch.

const COMP_PENDING_TTL_MS = 30 * 60 * 1000;

const compSchema = z.object({
  ticketTypeId: z.string().min(1, 'Choose a tier'),
  // 1..10 keeps the action ergonomic for actual comp use (a press
  // pair, a +3 entourage). Higher quantities should be a real
  // discounted order, not a comp.
  quantity: z.coerce.number().int().min(1).max(10),
  buyerName: z.string().trim().min(2, 'Recipient name required').max(120),
  buyerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isStrictEmail, { message: 'Enter a valid email address.' }),
  buyerPhone: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type GenerateCompResult =
  | { ok: true; orderId: string; reference: string; emailSent: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function generateComplimentaryOrder(
  eventId: string,
  _prev: GenerateCompResult | null,
  formData: FormData,
): Promise<GenerateCompResult> {
  await requireAdmin();
  const parsed = compSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      slug: true,
      ticketTypes: {
        where: { id: data.ticketTypeId },
        select: { id: true, name: true, quota: true, sold: true, priceMinor: true },
      },
    },
  });
  if (!event) return { ok: false, error: 'Event not found.' };
  const tier = event.ticketTypes[0];
  if (!tier) {
    return {
      ok: false,
      fieldErrors: { ticketTypeId: ['Selected tier no longer exists for this event.'] },
      error: 'Selected tier no longer exists for this event.',
    };
  }

  const reference = `dgcomp_${randomUUID().replace(/-/g, '')}`;
  // data.buyerEmail is already trimmed + lowercased by the zod schema.
  const cleanEmail = data.buyerEmail;
  const now = new Date();

  // Same capacity check the buyer-side checkout uses, quota minus
  // already-sold minus pending reservations. Comps consume real
  // inventory at the door, so we honour the same limit. Wrapped with
  // the writes so a concurrent buyer-side request can't race past
  // the gate between our read and our increment.
  type CompOutcome =
    | { ok: true; orderId: string }
    | { ok: false; status: 'capacity'; available: number; tierName: string };
  let outcome: CompOutcome;
  try {
    outcome = await db.$transaction(async (tx) => {
      const pending = await tx.orderItem.aggregate({
        where: {
          ticketTypeId: tier.id,
          order: {
            status: 'PENDING',
            createdAt: { gt: new Date(Date.now() - COMP_PENDING_TTL_MS) },
          },
        },
        _sum: { quantity: true },
      });
      const reserved = pending._sum.quantity ?? 0;
      const available = tier.quota - tier.sold - reserved;
      if (available < data.quantity) {
        return {
          ok: false as const,
          status: 'capacity' as const,
          available: Math.max(0, available),
          tierName: tier.name,
        };
      }

      const order = await tx.order.create({
        data: {
          reference,
          eventId: event.id,
          buyerName: data.buyerName,
          buyerEmail: cleanEmail,
          buyerPhone: data.buyerPhone ?? null,
          totalMinor: 0,
          status: 'PAID',
          paidAt: now,
          isComplimentary: true,
          compNote: data.note ?? null,
          items: {
            create: [
              {
                ticketTypeId: tier.id,
                quantity: data.quantity,
                unitPriceMinor: 0,
              },
            ],
          },
        },
        include: { items: { select: { id: true } } },
      });

      // Sign QR tokens for the just-created items. Two-pass is fine
      // here; the items rows are created above without a token, then
      // we set the signed token now that we have stable IDs.
      await Promise.all(
        order.items.map((item) =>
          tx.orderItem.update({
            where: { id: item.id },
            data: {
              qrToken: signTicket({
                orderItemId: item.id,
                orderId: order.id,
                eventId: event.id,
                issuedAt: now.getTime(),
              }),
            },
          }),
        ),
      );

      // Atomic capacity gate. The aggregate-then-check above closes the
      // common case but two interactive transactions running in parallel
      // can both pass it under READ COMMITTED, by the time we increment
      // sold, the other transaction may already have committed an
      // increment we didn't see. Conditional updateMany makes the
      // increment apply only if the row is still under quota; count===0
      // means we lost the race and need to roll back this whole
      // transaction. Throw so the outer catch surfaces a friendly
      // capacity error instead of letting an oversell land.
      const inc = await tx.ticketType.updateMany({
        where: { id: tier.id, sold: { lte: tier.quota - data.quantity } },
        data: { sold: { increment: data.quantity } },
      });
      if (inc.count === 0) {
        throw new CapacityRaceError(tier.name);
      }

      return { ok: true as const, orderId: order.id };
    });
  } catch (err) {
    if (err instanceof CapacityRaceError) {
      return {
        ok: false,
        fieldErrors: {
          quantity: [
            `${err.tierName} just sold out. Refresh and try a different tier.`,
          ],
        },
        error: 'Tier filled up while we were issuing, refresh to see the latest counts.',
      };
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      Array.isArray(err.meta?.target) &&
      (err.meta.target as string[]).includes('reference')
    ) {
      // Astronomically unlikely (UUID space), but if randomUUID
      // happened to collide we surface a retryable error instead of
      // bubbling a Prisma error to the admin.
      return { ok: false, error: 'Reference collision, try again.' };
    }
    captureError('[admin:generateComplimentaryOrder]', err, { eventId, tier: data.ticketTypeId });
    return { ok: false, error: 'Could not issue tickets. Try again.' };
  }
  if (!outcome.ok) {
    return {
      ok: false,
      fieldErrors: {
        quantity: [
          outcome.available === 0
            ? `${outcome.tierName} is sold out, no comps available.`
            : `Only ${outcome.available} ${outcome.tierName} ticket${outcome.available === 1 ? '' : 's'} left.`,
        ],
      },
      error: 'Not enough inventory for this tier.',
    };
  }

  // Email + PDF. Best-effort: if it fails the order still exists, the
  // recipient can be reached via /tickets/[orderId]?ref=... and ops
  // has the resend button as a fallback. Mirror the webhook pattern.
  let emailSent = false;
  try {
    const fresh = await db.order.findUniqueOrThrow({
      where: { id: outcome.orderId },
      include: { event: true, items: { include: { ticketType: true } } },
    });
    const pdf = await buildTicketPdf(fresh.id).catch((err) => {
      captureError('[admin:generateComplimentaryOrder] PDF build failed', err, {
        orderId: fresh.id,
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
      // Distinct prefix so the recipient sees this is a gift, not a
      // charge confirmation. The buyer-side ticket page is identical
      // either way, comp orders are PAID just like real ones.
      subjectPrefix: 'Complimentary tickets for',
    });
    emailSent = true;
  } catch (err) {
    captureError('[admin:generateComplimentaryOrder] email send failed', err, {
      orderId: outcome.orderId,
    });
    // Don't bubble; the action's main job (issue tickets) succeeded.
    // emailSent stays false; the form surfaces a non-blocking warning
    // and ops can fall back to the resend button on the order detail
    // page once Resend recovers (this branch is overwhelmingly hit on
    // a transient MailProviderUnavailableError).
  }

  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${outcome.orderId}`);
  revalidatePath(`/admin/events/${eventId}/comps`);
  revalidatePath(`/events/${event.slug}`);
  revalidatePath(`/events/${event.slug}/tickets`);
  revalidatePath('/events');
  revalidatePath('/');

  return { ok: true, orderId: outcome.orderId, reference, emailSent };
}
