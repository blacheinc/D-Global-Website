'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { captureError } from '@/server/observability';

// Empty form fields arrive as '' from FormData; emptyToUndefined() below
// strips them so .optional() does the right thing without a noisy union.
const eventSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, digits, and dashes only'),
  title: z.string().min(2).max(140),
  subtitle: z.string().max(200).optional(),
  description: z.string().min(10).max(4000),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  doorsAt: z.coerce.date().optional(),
  venueName: z.string().min(2).max(120),
  venueCity: z.string().min(2).max(80).default('Accra'),
  venueAddress: z.string().max(240).optional(),
  venueMapUrl: z.string().url().optional(),
  heroImage: z.string().min(1).max(500),
  genre: z.string().max(200).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'SOLD_OUT', 'CANCELLED']).default('DRAFT'),
  featured: z.preprocess((v) => v === 'on' || v === true || v === 'true', z.boolean()),
});

export type EventFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function emptyToUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === '' ? undefined : v;
  }
  return out as Partial<T>;
}

function parseGenre(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
}

export async function upsertEvent(
  id: string | null,
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  await requireAdmin();
  const raw = Object.fromEntries(formData.entries());
  const parsed = eventSchema.safeParse(emptyToUndefined(raw));
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  // Slug uniqueness — the unique constraint will reject this anyway, but
  // a friendly message beats a Prisma stack trace in the UI.
  const collision = await db.event.findFirst({
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
    title: data.title,
    subtitle: data.subtitle ?? null,
    description: data.description,
    startsAt: data.startsAt,
    endsAt: data.endsAt ?? null,
    doorsAt: data.doorsAt ?? null,
    venueName: data.venueName,
    venueCity: data.venueCity,
    venueAddress: data.venueAddress ?? null,
    venueMapUrl: data.venueMapUrl ?? null,
    heroImage: data.heroImage,
    genre: parseGenre(data.genre),
    status: data.status,
    featured: data.featured,
  };
  try {
    if (id) {
      await db.event.update({ where: { id }, data: payload });
    } else {
      await db.event.create({ data: payload });
    }
  } catch (err) {
    captureError('[admin:upsertEvent]', err, { id, slug: data.slug });
    return { ok: false, error: 'Could not save the event. Try again.' };
  }
  // Revalidate every surface the event appears on. /events/[slug] uses
  // `cache()` for the slug lookup so the dedup is per-request — the
  // revalidatePath call invalidates the underlying RSC cache.
  revalidatePath('/admin/events');
  revalidatePath('/events');
  revalidatePath(`/events/${data.slug}`);
  redirect('/admin/events');
}

export async function deleteEvent(id: string): Promise<void> {
  await requireAdmin();
  try {
    await db.event.delete({ where: { id } });
  } catch (err) {
    captureError('[admin:deleteEvent]', err, { id });
    // Preserve the cause so Sentry's linkedErrorsIntegration ties this
    // user-facing wrapper to the original DB error in the dashboard.
    throw new Error('Could not delete event.', { cause: err });
  }
  revalidatePath('/admin/events');
  revalidatePath('/events');
}
