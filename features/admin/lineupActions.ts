'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { captureError } from '@/server/observability';

// Admin CRUD for LineupSlot (event subresource). Lineup slots have an
// optional artistId — a slot can name a DJ/artist record, or just carry
// a free-form display name (e.g., a guest MC who doesn't need an artist
// page). The public event detail page renders this list in `order`.

const lineupSchema = z.object({
  displayName: z.string().min(1).max(120),
  role: z.string().max(80).optional(),
  slotStart: z.coerce.date().optional(),
  order: z.coerce.number().int().min(0).max(1000).default(0),
  artistId: z.string().min(1).optional(),
});

export type LineupFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function emptyToUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === '' ? undefined : v;
  return out as Partial<T>;
}

export async function upsertLineupSlot(
  eventId: string,
  id: string | null,
  _prev: LineupFormState,
  formData: FormData,
): Promise<LineupFormState> {
  await requireAdmin();
  const raw = Object.fromEntries(formData.entries());
  const parsed = lineupSchema.safeParse(emptyToUndefined(raw));
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  const payload = {
    eventId,
    displayName: data.displayName,
    role: data.role ?? null,
    slotStart: data.slotStart ?? null,
    order: data.order,
    artistId: data.artistId ?? null,
  };
  try {
    if (id) {
      await db.lineupSlot.update({ where: { id }, data: payload });
    } else {
      await db.lineupSlot.create({ data: payload });
    }
  } catch (err) {
    captureError('[admin:upsertLineupSlot]', err, { eventId, id });
    return { ok: false, error: 'Could not save the lineup slot. Try again.' };
  }
  const event = await db.event.findUnique({ where: { id: eventId }, select: { slug: true } });
  revalidatePath(`/admin/events/${eventId}/lineup`);
  if (event) revalidatePath(`/events/${event.slug}`);
  return { ok: true };
}

export type DeleteLineupResult = { ok: true } | { ok: false; error: string };

export async function deleteLineupSlot(
  eventId: string,
  id: string,
): Promise<DeleteLineupResult> {
  await requireAdmin();
  try {
    await db.lineupSlot.delete({ where: { id } });
  } catch (err) {
    captureError('[admin:deleteLineupSlot]', err, { eventId, id });
    return { ok: false, error: 'Could not delete the slot. Try again.' };
  }
  const event = await db.event.findUnique({ where: { id: eventId }, select: { slug: true } });
  revalidatePath(`/admin/events/${eventId}/lineup`);
  if (event) revalidatePath(`/events/${event.slug}`);
  return { ok: true };
}
