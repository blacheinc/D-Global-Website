'use server';

import { z } from 'zod';
import { BookingStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { captureError } from '@/server/observability';

// Bookings are read-mostly but admins need to flip status as they
// reach out to guests on WhatsApp ("Confirmed", "Cancelled",
// "Waitlisted"). No full form — just a status update.

const statusSchema = z.object({
  status: z.nativeEnum(BookingStatus),
});

export type BookingStatusResult = { ok: true } | { ok: false; error: string };

export async function updateBookingStatus(
  id: string,
  formData: FormData,
): Promise<BookingStatusResult> {
  await requireAdmin();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: 'Invalid status value.' };
  }
  try {
    await db.booking.update({
      where: { id },
      data: { status: parsed.data.status },
    });
  } catch (err) {
    captureError('[admin:updateBookingStatus]', err, { id });
    return { ok: false, error: 'Could not update status. Try again.' };
  }
  revalidatePath('/admin/bookings');
  revalidatePath(`/admin/bookings/${id}`);
  return { ok: true };
}
