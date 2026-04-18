'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { db } from '@/server/db';
import { bookingSchema } from './schema';
import { captureError } from '@/server/observability';
import { rateLimitHeaders } from '@/server/rateLimit';

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
  // Server actions are already origin-pinned by Next (built-in CSRF
  // defense) so we don't need an isSameOrigin check here. But a human
  // never needs to submit 5 bookings in 10 minutes, a scripted spam
  // run clearly could. Cap it.
  const rl = rateLimitHeaders(await headers(), 'bookings', 5, 10 * 60 * 1000);
  if (!rl.ok) {
    return {
      ok: false,
      error: `You've submitted a lot of bookings recently. Try again in ${rl.retryAfterSec}s.`,
    };
  }

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

  let bookingCode: string;
  try {
    const pkg = await db.package.findUnique({
      where: { tier: parsed.data.packageTier },
    });
    // active gates whether the package can accept new bookings. Admins
    // flip it to false to retire a tier without deleting (delete would
    // trip the FK from historical Bookings). Without this check, a
    // retired tier stayed quietly bookable through the form even though
    // the /bookings page had already hidden it, a race that turned
    // into a persistent UI-vs-API mismatch for anyone with the tier's
    // URL or a stale tab.
    if (!pkg || !pkg.active) {
      return { ok: false, error: 'Selected package is no longer available.' };
    }

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
    bookingCode = booking.code;
  } catch (err) {
    captureError('[createBooking] DB error', err, {
      packageTier: parsed.data.packageTier,
    });
    return {
      ok: false,
      error: "Something went wrong on our side. Try again, or message us on WhatsApp.",
    };
  }

  // redirect() throws NEXT_REDIRECT by design, keep it OUTSIDE the try/catch
  // so the framework can intercept it.
  redirect(`/bookings/confirmation?code=${bookingCode}`);
}
