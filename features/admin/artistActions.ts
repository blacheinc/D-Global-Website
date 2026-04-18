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
  redirect('/admin/artists');
}

export type DeleteArtistResult = { ok: true } | { ok: false; error: string };

export async function deleteArtist(id: string): Promise<DeleteArtistResult> {
  await requireAdmin();

  // Releases cascade from Artist (`onDelete: Cascade` in schema), which
  // also removes their Tracks. Lineup slots reference Artist via an
  // optional FK (SetNull default) — slots survive the artist removal,
  // just with artistId cleared.
  //
  // No hard pre-check needed because no FK has Restrict here. But
  // releases+tracks being cascade-deleted is destructive — flag it
  // loudly via the caller's confirm().
  try {
    await db.artist.delete({ where: { id } });
  } catch (err) {
    captureError('[admin:deleteArtist]', err, { id });
    return { ok: false, error: 'Could not delete the artist. Try again.' };
  }
  revalidatePath('/admin/artists');
  revalidatePath('/artists');
  revalidatePath('/releases');
  revalidatePath('/');
  return { ok: true };
}
