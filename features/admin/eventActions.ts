'use server';

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { captureError } from '@/server/observability';

// Empty form fields arrive as '' from FormData; emptyToUndefined() below
// strips them so .optional() does the right thing without a noisy union.
const eventSchema = z
  .object({
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
    // URL-validate the hero image so bad data surfaces here, not 10 hops
    // later at `next/image` with a cryptic "Invalid src prop" error on
    // the public event page. next.config's remotePatterns still gates
    // which hosts are actually fetched.
    heroImage: z.string().url().max(500),
    genre: z.string().max(200).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'SOLD_OUT', 'CANCELLED']).default('DRAFT'),
    featured: z.preprocess((v) => v === 'on' || v === true || v === 'true', z.boolean()),
  })
  // Cross-field date ordering. Catches the classic typos — doors opening
  // after the show starts, show ending before it begins — at the admin
  // boundary instead of letting them render as negative durations on the
  // public page.
  .superRefine((val, ctx) => {
    if (val.doorsAt && val.doorsAt.getTime() > val.startsAt.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['doorsAt'],
        message: 'Doors must open at or before the start time.',
      });
    }
    if (val.endsAt && val.endsAt.getTime() <= val.startsAt.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'End time must be after the start time.',
      });
    }
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
    // P2002 = unique constraint violation. The pre-check above closes 99%
    // of slug collisions, but two admins submitting the same slug at the
    // same moment can both pass the check and race into the write. Without
    // this, the admin sees "Could not save. Try again." which doesn't
    // actually help — retrying the same slug hits the same collision.
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

export type DeleteEventResult = { ok: true } | { ok: false; error: string };

export async function deleteEvent(id: string): Promise<DeleteEventResult> {
  await requireAdmin();

  // Pre-check: Order.eventId is required with the default Restrict cascade,
  // so Prisma throws an opaque FK violation if we try to delete an event
  // that has any orders. Catch it here with a message that tells the admin
  // what to do instead (set status=CANCELLED preserves the audit trail).
  const orderCount = await db.order.count({ where: { eventId: id } });
  if (orderCount > 0) {
    return {
      ok: false,
      error: `This event has ${orderCount} order${orderCount === 1 ? '' : 's'} and can't be deleted. Set its status to Cancelled instead — tickets already sold keep working.`,
    };
  }

  try {
    await db.event.delete({ where: { id } });
  } catch (err) {
    captureError('[admin:deleteEvent]', err, { id });
    return { ok: false, error: 'Could not delete the event. Try again in a moment.' };
  }
  revalidatePath('/admin/events');
  revalidatePath('/events');
  return { ok: true };
}
