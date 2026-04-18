'use server';

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { captureError } from '@/server/observability';

const artistSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, digits, and dashes only'),
  stageName: z.string().min(1).max(120),
  bio: z.string().max(4000).optional(),
  avatar: z.string().url().max(500).optional(),
  heroImage: z.string().url().max(500).optional(),
  spotifyId: z.string().max(100).optional(),
  audiomackId: z.string().max(100).optional(),
  instagram: z.string().url().max(300).optional(),
  twitter: z.string().url().max(300).optional(),
  featured: z.preprocess((v) => v === 'on' || v === true || v === 'true', z.boolean()),
});

export type ArtistFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function emptyToUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === '' ? undefined : v;
  return out as Partial<T>;
}

export async function upsertArtist(
  id: string | null,
  _prev: ArtistFormState,
  formData: FormData,
): Promise<ArtistFormState> {
  await requireAdmin();
  const parsed = artistSchema.safeParse(emptyToUndefined(Object.fromEntries(formData.entries())));
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  // Fetch old slug before write so we can revalidate the stale URL if
  // the admin renames the artist.
  const previous = id
    ? await db.artist.findUnique({ where: { id }, select: { slug: true } })
    : null;
  const collision = await db.artist.findFirst({
    where: { slug: data.slug, NOT: id ? { id } : undefined },
    select: { id: true },
  });
  if (collision) {
    return {
      ok: false,
      fieldErrors: { slug: ['Slug is already in use.'] },
      error: 'That slug is taken.',
    };
  }
  const payload = {
    slug: data.slug,
    stageName: data.stageName,
    bio: data.bio ?? null,
    avatar: data.avatar ?? null,
    heroImage: data.heroImage ?? null,
    spotifyId: data.spotifyId ?? null,
    audiomackId: data.audiomackId ?? null,
    instagram: data.instagram ?? null,
    twitter: data.twitter ?? null,
    featured: data.featured,
  };
  try {
    if (id) await db.artist.update({ where: { id }, data: payload });
    else await db.artist.create({ data: payload });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      Array.isArray(err.meta?.target) &&
      (err.meta.target as string[]).includes('slug')
    ) {
      return {
        ok: false,
        fieldErrors: { slug: ['Slug is already in use.'] },
        error: 'That slug is taken.',
      };
    }
    captureError('[admin:upsertArtist]', err, { id, slug: data.slug });
    return { ok: false, error: 'Could not save the artist. Try again.' };
  }
  revalidatePath('/admin/artists');
  revalidatePath('/artists');
  revalidatePath(`/artists/${data.slug}`);
  revalidatePath('/');
  if (previous && previous.slug !== data.slug) {
    revalidatePath(`/artists/${previous.slug}`);
  }
  redirect('/admin/artists');
}

export type DeleteArtistResult = { ok: true } | { ok: false; error: string };

export async function deleteArtist(id: string): Promise<DeleteArtistResult> {
  await requireAdmin();

  // Releases cascade from Artist (`onDelete: Cascade` in schema), which
  // also removes their Tracks. Lineup slots reference Artist via an
  // optional FK (SetNull default), slots survive the artist removal,
  // just with artistId cleared, so the event page will render the
  // slot's displayName without a link.
  //
  // Fetch everything we'll need for revalidation in one round-trip:
  // - slug for the artist's own static page
  // - release slugs (cascade-deleted, their pages now 404)
  // - distinct event slugs where this artist was in the lineup, so those
  //   event pages re-render and drop the now-dangling artist link
  // - artistBooking count so we can block the delete with a useful
  //   message when bookings exist (FK is Restrict; bookings are audit
  //   data worth keeping, not worth cascading to /dev/null)
  const artist = await db.artist.findUnique({
    where: { id },
    select: {
      slug: true,
      releases: { select: { slug: true } },
      lineupSlots: { select: { event: { select: { slug: true } } } },
      _count: { select: { artistBookings: true } },
    },
  });
  if (!artist) return { ok: false, error: 'Artist not found.' };

  if (artist._count.artistBookings > 0) {
    return {
      ok: false,
      error: `This artist has ${artist._count.artistBookings} booking request${artist._count.artistBookings === 1 ? '' : 's'} on file. Mark them declined or cancelled first, then delete the artist.`,
    };
  }

  try {
    await db.artist.delete({ where: { id } });
  } catch (err) {
    captureError('[admin:deleteArtist]', err, { id });
    return { ok: false, error: 'Could not delete the artist. Try again.' };
  }
  revalidatePath('/admin/artists');
  revalidatePath('/artists');
  revalidatePath(`/artists/${artist.slug}`);
  revalidatePath('/releases');
  for (const r of artist.releases) revalidatePath(`/releases/${r.slug}`);
  // Dedup, the same event can have multiple slots for the same artist.
  const eventSlugs = new Set(artist.lineupSlots.map((s) => s.event.slug));
  for (const slug of eventSlugs) revalidatePath(`/events/${slug}`);
  revalidatePath('/');
  return { ok: true };
}
