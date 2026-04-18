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
// We intentionally don't allow reverting PAID → PENDING from here —
// that would desync the `sold` counter on TicketType (which the webhook
// incremented). Refunds go PAID → REFUNDED.

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
    select: { status: true },
  });
  if (!order) return { ok: false, error: 'Order not found.' };

  // Guard rail: refuse PAID → PENDING. Webhook ownership of the sold
  // counter assumes monotonic transitions out of PAID.
  if (order.status === 'PAID' && parsed.data.status === 'PENDING') {
    return {
      ok: false,
      error: 'Can’t revert PAID to PENDING — use REFUNDED so the tickets-sold counter stays consistent.',
    };
  }

  try {
    await db.order.update({
      where: { id },
      data: { status: parsed.data.status },
    });
  } catch (err) {
    captureError('[admin:updateOrderStatus]', err, { id });
    return { ok: false, error: 'Could not update status. Try again.' };
  }
  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${id}`);
  return { ok: true };
}
