import { z } from 'zod';

// Inbound artist-booking request (label side). This is the form buyers
// fill out to ask D-Global to quote for one of our artists — distinct
// from features/bookings/schema.ts (VIP table reservations at our own
// nights), so the shapes don't share fields.

export const artistBookingSchema = z.object({
  artistId: z.string().min(1),
  requesterName: z.string().min(2, 'Tell us who to follow up with.').max(120),
  requesterEmail: z.string().email('A real email so we can reply.'),
  requesterPhone: z
    .string()
    .regex(/^\+?\d{8,15}$/, 'Enter a valid phone number, digits only with optional +.'),
  company: z.string().max(120).optional().or(z.literal('')),
  // datetime-local arrives as YYYY-MM-DDTHH:mm; z.coerce.date handles it.
  // Refining for "in the future" is intentionally permissive — same-day
  // private events happen; the only hard bar is not scheduling in the
  // past, which is almost always a typo.
  eventDate: z.coerce.date().refine((d) => d.getTime() > Date.now() - 24 * 60 * 60 * 1000, {
    message: 'Pick a date today or later.',
  }),
  venueName: z.string().min(2, 'Where is the show?').max(160),
  city: z.string().min(2).max(80),
  country: z.string().min(2).max(80).default('Ghana'),
  // Budget is in minor units so it stays in lockstep with Package /
  // TicketType pricing. Optional because serious buyers often want a
  // conversation before committing to a figure. preprocess strips the
  // empty-string FormData default so .optional() does the right thing
  // (z.coerce.number() would turn '' into 0 and accept it as a budget).
  budgetMinor: z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number().int().min(0).max(1_000_000_000).optional(),
  ),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export type ArtistBookingPayload = z.infer<typeof artistBookingSchema>;
