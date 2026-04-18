'use server';

import { z } from 'zod';
import { OrderStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { captureError } from '@/server/observability';

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
      items: { select: { ticketTypeId: true, quantity: true } },
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

  try {
    await db.$transaction([
      db.order.update({
        where: { id },
        data: { status: parsed.data.status },
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
