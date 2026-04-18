'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ArtistBookingStatus } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/server/db';
import { artistBookingSchema } from './schema';
import { captureError } from '@/server/observability';
import { rateLimitHeaders } from '@/server/rateLimit';
import { requireAdmin } from '@/server/auth';

// Public: create an artist-booking request from the form on the artist
// detail page. Mirrors features/bookings/actions.ts: server action with
// useActionState-compatible shape, rate-limited (Next already pins
// origin for actions), redirects to a confirmation route on success.

export type ArtistBookingActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  bookingCode?: string;
};

export async function createArtistBooking(
  _prev: ArtistBookingActionState,
  formData: FormData,
): Promise<ArtistBookingActionState> {
  // 5 requests / 10min / IP. A serious booker filling one out by hand
  // stays well under; a scripted spammer bouncing off the form gets
  // stopped here before reaching the DB.
  const rl = rateLimitHeaders(await headers(), 'artist-bookings', 5, 10 * 60 * 1000);
  if (!rl.ok) {
    return {
      ok: false,
      error: `Too many requests. Try again in ${rl.retryAfterSec}s.`,
    };
  }

  const raw = {
    artistId: formData.get('artistId'),
    requesterName: formData.get('requesterName'),
    requesterEmail: formData.get('requesterEmail'),
    requesterPhone: formData.get('requesterPhone'),
    company: formData.get('company') || '',
    eventDate: formData.get('eventDate'),
    venueName: formData.get('venueName'),
    city: formData.get('city'),
    country: formData.get('country') || 'Ghana',
    budgetMinor: formData.get('budgetMinor') || undefined,
    notes: formData.get('notes') || '',
  };

  const parsed = artistBookingSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };
  }

  let bookingCode: string;
  try {
    // Validate the artistId actually resolves so the FK error becomes a
    // clean "artist not found" instead of a Prisma P2003 stack trace.
    const artist = await db.artist.findUnique({
      where: { id: parsed.data.artistId },
      select: { id: true, slug: true, stageName: true },
    });
    if (!artist) {
      return { ok: false, error: 'That artist is no longer bookable through this form.' };
    }
    const booking = await db.artistBooking.create({
      data: {
        artistId: artist.id,
        requesterName: parsed.data.requesterName,
        requesterEmail: parsed.data.requesterEmail,
        requesterPhone: parsed.data.requesterPhone,
        company: parsed.data.company || null,
        eventDate: parsed.data.eventDate,
        venueName: parsed.data.venueName,
        city: parsed.data.city,
        country: parsed.data.country,
        budgetMinor: parsed.data.budgetMinor ?? null,
        notes: parsed.data.notes || null,
      },
      select: { code: true },
    });
    bookingCode = booking.code;
    // Push the new row onto the admin dashboard so the counter/list
    // pick it up without an admin having to refresh. The public artist
    // page isn't invalidated, nothing public surfaces per-artist
    // booking state today.
    revalidatePath('/admin/artist-bookings');
  } catch (err) {
    captureError('[createArtistBooking] DB error', err, {
      artistId: parsed.data.artistId,
    });
    return {
      ok: false,
      error: "Something went wrong on our side. Try again, or reach us on WhatsApp.",
    };
  }

  // NEXT_REDIRECT throws, keep it OUTSIDE the try/catch so the
  // framework can intercept it instead of the catch swallowing it.
  redirect(`/artists/booking/confirmation?code=${bookingCode}`);
}

// --- Admin ---
//
// Status-only update. An admin moves PENDING → REVIEWING when they
// pick up the request, then CONFIRMED / DECLINED once they've made a
// decision with the booker. CANCELLED is for requesters who pulled
// out after the fact. No free-form admin notes field yet, if the
// label needs one later, bolt on a separate comments model rather
// than letting admins overwrite the requester's notes.

const statusSchema = z.object({ status: z.nativeEnum(ArtistBookingStatus) });

export type ArtistBookingStatusResult = { ok: true } | { ok: false; error: string };

export async function updateArtistBookingStatus(
  id: string,
  formData: FormData,
): Promise<ArtistBookingStatusResult> {
  await requireAdmin();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: 'Invalid status value.' };
  try {
    await db.artistBooking.update({
      where: { id },
      data: { status: parsed.data.status },
    });
  } catch (err) {
    captureError('[admin:updateArtistBookingStatus]', err, { id });
    return { ok: false, error: 'Could not update status. Try again.' };
  }
  revalidatePath('/admin/artist-bookings');
  revalidatePath(`/admin/artist-bookings/${id}`);
  return { ok: true };
}
