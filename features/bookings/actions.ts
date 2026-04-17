'use server';

import { redirect } from 'next/navigation';
import { PackageTier } from '@prisma/client';
import { db } from '@/server/db';
import { bookingSchema } from './schema';

export type BookingActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  bookingCode?: string;
};

export async function createBooking(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const raw = {
    packageTier: formData.get('packageTier'),
    eventId: formData.get('eventId') || null,
    guestName: formData.get('guestName'),
    guestPhone: formData.get('guestPhone'),
    guestEmail: formData.get('guestEmail') || '',
    partySize: formData.get('partySize'),
    notes: formData.get('notes') || '',
  };

  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: 'Please check the form and try again.', fieldErrors };
  }

  const pkg = await db.package.findUnique({
    where: { tier: parsed.data.packageTier as PackageTier },
  });
  if (!pkg) return { ok: false, error: 'Selected package is no longer available.' };

  const event = parsed.data.eventId
    ? await db.event.findUnique({ where: { id: parsed.data.eventId } })
    : null;

  const booking = await db.booking.create({
    data: {
      packageId: pkg.id,
      eventId: event?.id ?? null,
      guestName: parsed.data.guestName,
      guestPhone: parsed.data.guestPhone,
      guestEmail: parsed.data.guestEmail || null,
      partySize: parsed.data.partySize,
      notes: parsed.data.notes || null,
    },
  });

  redirect(`/bookings/confirmation?code=${booking.code}`);
}
