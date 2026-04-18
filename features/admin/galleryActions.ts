'use server';

import { z } from 'zod';
import { GalleryCategory } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { captureError } from '@/server/observability';

// Gallery is upload-first: admin uploads an image via <ImageUpload>, then
// submits a lightweight form with metadata (caption, category, event link).
// The URL field is the upload result.

const gallerySchema = z.object({
  url: z.string().url().max(500),
  caption: z.string().max(300).optional(),
  category: z.nativeEnum(GalleryCategory),
  eventId: z.string().min(1).optional(),
  featured: z.preprocess((v) => v === 'on' || v === true || v === 'true', z.boolean()),
  order: z.coerce.number().int().min(0).max(10_000).default(0),
});

export type GalleryFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function emptyToUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === '' ? undefined : v;
  return out as Partial<T>;
}

export async function upsertGalleryImage(
  id: string | null,
  _prev: GalleryFormState,
  formData: FormData,
): Promise<GalleryFormState> {
  await requireAdmin();
  const parsed = gallerySchema.safeParse(emptyToUndefined(Object.fromEntries(formData.entries())));
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  const payload = {
    url: data.url,
    caption: data.caption ?? null,
    category: data.category,
    eventId: data.eventId ?? null,
    featured: data.featured,
    order: data.order,
  };
  try {
    if (id) await db.galleryImage.update({ where: { id }, data: payload });
    else await db.galleryImage.create({ data: payload });
  } catch (err) {
    captureError('[admin:upsertGalleryImage]', err, { id });
    return { ok: false, error: 'Could not save the image. Try again.' };
  }
  revalidatePath('/admin/gallery');
  revalidatePath('/gallery');
  revalidatePath('/'); // homepage GalleryPreview
  return { ok: true };
}

export type DeleteGalleryResult = { ok: true } | { ok: false; error: string };

export async function deleteGalleryImage(id: string): Promise<DeleteGalleryResult> {
  await requireAdmin();
  try {
    await db.galleryImage.delete({ where: { id } });
  } catch (err) {
    captureError('[admin:deleteGalleryImage]', err, { id });
    return { ok: false, error: 'Could not delete the image. Try again.' };
  }
  revalidatePath('/admin/gallery');
  revalidatePath('/gallery');
  revalidatePath('/');
  return { ok: true };
}
