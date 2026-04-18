'use server';

import { z } from 'zod';
import { Prisma, ReleaseKind } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { captureError } from '@/server/observability';

const releaseSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, digits, and dashes only'),
  artistId: z.string().min(1),
  title: z.string().min(1).max(140),
  kind: z.nativeEnum(ReleaseKind),
  coverImage: z.string().url().max(500),
  releasedAt: z.coerce.date(),
  spotifyUrl: z.string().url().max(500).optional(),
  audiomackUrl: z.string().url().max(500).optional(),
  youtubeUrl: z.string().url().max(500).optional(),
});

export type ReleaseFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function emptyToUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === '' ? undefined : v;
  return out as Partial<T>;
}

export async function upsertRelease(
  id: string | null,
  _prev: ReleaseFormState,
  formData: FormData,
): Promise<ReleaseFormState> {
  await requireAdmin();
  const parsed = releaseSchema.safeParse(emptyToUndefined(Object.fromEntries(formData.entries())));
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  // Fetch old slug + old artistId before write. We need old slug for
  // stale-URL revalidation when the admin renames; old artistId to
  // revalidate the PREVIOUS artist's page if the release is reassigned.
  const previous = id
    ? await db.release.findUnique({ where: { id }, select: { slug: true, artistId: true } })
    : null;
  const collision = await db.release.findFirst({
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
  // Validate the artist exists before we try to write the FK, Prisma's
  // error would otherwise be an ungrouped "foreign key constraint" which
  // surfaces as a generic "Could not save."
  const artistExists = await db.artist.findUnique({
    where: { id: data.artistId },
    select: { id: true },
  });
  if (!artistExists) {
    return {
      ok: false,
      fieldErrors: { artistId: ['Selected artist no longer exists.'] },
      error: 'Pick a different artist.',
    };
  }

  const payload = {
    slug: data.slug,
    artistId: data.artistId,
    title: data.title,
    kind: data.kind,
    coverImage: data.coverImage,
    releasedAt: data.releasedAt,
    spotifyUrl: data.spotifyUrl ?? null,
    audiomackUrl: data.audiomackUrl ?? null,
    youtubeUrl: data.youtubeUrl ?? null,
  };
  try {
    if (id) await db.release.update({ where: { id }, data: payload });
    else await db.release.create({ data: payload });
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
    captureError('[admin:upsertRelease]', err, { id, slug: data.slug });
    return { ok: false, error: 'Could not save the release. Try again.' };
  }
  // Fetch the new-artist slug so we can revalidate their detail page -
  // their release list just grew (or changed) and the artist page
  // renders it. Also revalidate the PREVIOUS artist's page if the
  // release was reassigned (they no longer own this release).
  const [newArtist, prevArtist] = await Promise.all([
    db.artist.findUnique({ where: { id: data.artistId }, select: { slug: true } }),
    previous && previous.artistId !== data.artistId
      ? db.artist.findUnique({ where: { id: previous.artistId }, select: { slug: true } })
      : Promise.resolve(null),
  ]);
  revalidatePath('/admin/releases');
  revalidatePath('/releases');
  revalidatePath(`/releases/${data.slug}`);
  if (previous && previous.slug !== data.slug) {
    revalidatePath(`/releases/${previous.slug}`);
  }
  if (newArtist) revalidatePath(`/artists/${newArtist.slug}`);
  if (prevArtist) revalidatePath(`/artists/${prevArtist.slug}`);
  redirect('/admin/releases');
}

export type DeleteReleaseResult = { ok: true } | { ok: false; error: string };

export async function deleteRelease(id: string): Promise<DeleteReleaseResult> {
  await requireAdmin();

  // Fetch slug + owning artist slug before the delete so we can
  // revalidate both the release's static page AND the artist page
  // (whose discography list just shrank).
  const release = await db.release.findUnique({
    where: { id },
    select: { slug: true, artist: { select: { slug: true } } },
  });
  if (!release) return { ok: false, error: 'Release not found.' };

  // Tracks cascade from Release (onDelete: Cascade in schema).
  try {
    await db.release.delete({ where: { id } });
  } catch (err) {
    captureError('[admin:deleteRelease]', err, { id });
    return { ok: false, error: 'Could not delete the release. Try again.' };
  }
  revalidatePath('/admin/releases');
  revalidatePath('/releases');
  revalidatePath(`/releases/${release.slug}`);
  revalidatePath(`/artists/${release.artist.slug}`);
  return { ok: true };
}

// --- Tracks (nested under a Release) ---

const trackSchema = z.object({
  title: z.string().min(1).max(140),
  durationSec: z.coerce.number().int().min(0).max(7200).optional(),
  spotifyId: z.string().max(100).optional(),
  order: z.coerce.number().int().min(0).max(1000).default(0),
});

export type TrackFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function upsertTrack(
  releaseId: string,
  id: string | null,
  _prev: TrackFormState,
  formData: FormData,
): Promise<TrackFormState> {
  await requireAdmin();
  const parsed = trackSchema.safeParse(emptyToUndefined(Object.fromEntries(formData.entries())));
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  const payload = {
    releaseId,
    title: data.title,
    durationSec: data.durationSec ?? null,
    spotifyId: data.spotifyId ?? null,
    order: data.order,
  };
  try {
    if (id) await db.track.update({ where: { id }, data: payload });
    else await db.track.create({ data: payload });
  } catch (err) {
    captureError('[admin:upsertTrack]', err, { releaseId, id });
    return { ok: false, error: 'Could not save the track. Try again.' };
  }
  const release = await db.release.findUnique({
    where: { id: releaseId },
    select: { slug: true },
  });
  revalidatePath(`/admin/releases/${releaseId}/edit`);
  if (release) revalidatePath(`/releases/${release.slug}`);
  return { ok: true };
}

export type DeleteTrackResult = { ok: true } | { ok: false; error: string };

export async function deleteTrack(
  releaseId: string,
  id: string,
): Promise<DeleteTrackResult> {
  await requireAdmin();
  try {
    await db.track.delete({ where: { id } });
  } catch (err) {
    captureError('[admin:deleteTrack]', err, { releaseId, id });
    return { ok: false, error: 'Could not delete the track. Try again.' };
  }
  const release = await db.release.findUnique({
    where: { id: releaseId },
    select: { slug: true },
  });
  revalidatePath(`/admin/releases/${releaseId}/edit`);
  if (release) revalidatePath(`/releases/${release.slug}`);
  return { ok: true };
}
