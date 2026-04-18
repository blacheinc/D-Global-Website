'use server';

import { z } from 'zod';
import { Prisma, TicketTier } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { captureError } from '@/server/observability';

// Admin CRUD for TicketType (event subresource). Tiers are enum-bound by
// the schema; there's at most one of each tier per event because the
// pricing model is "one price per tier per event". We enforce that at
// the action level with a pre-check + P2002 race catch, mirroring the
// slug pattern in eventActions.
//
// `quota` and `sold` live on the row; we only let admins edit quota
// (raising/lowering capacity). `sold` is managed server-side by the
// Paystack webhook via atomic increment.

const ticketTypeSchema = z
  .object({
    tier: z.nativeEnum(TicketTier),
    name: z.string().min(2).max(80),
    description: z.string().max(300).optional(),
    priceMinor: z.coerce.number().int().min(0).max(100_000_00),
    currency: z.string().length(3).default('GHS'),
    quota: z.coerce.number().int().min(0).max(100_000),
    salesStart: z.coerce.date().optional(),
    salesEnd: z.coerce.date().optional(),
    paymentLinkUrl: z.string().url().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.salesStart && val.salesEnd && val.salesEnd.getTime() <= val.salesStart.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['salesEnd'],
        message: 'Sales end must be after sales start.',
      });
    }
  });

export type TicketTypeFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function emptyToUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === '' ? undefined : v;
  return out as Partial<T>;
}

export async function upsertTicketType(
  eventId: string,
  id: string | null,
  _prev: TicketTypeFormState,
  formData: FormData,
): Promise<TicketTypeFormState> {
  await requireAdmin();
  const raw = Object.fromEntries(formData.entries());
  const parsed = ticketTypeSchema.safeParse(emptyToUndefined(raw));
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // One tier per event — catch the collision here instead of leaving
  // Prisma to reject with a cryptic @@unique violation on [eventId, tier].
  const existing = await db.ticketType.findFirst({
    where: { eventId, tier: parsed.data.tier, NOT: id ? { id } : undefined },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      error: `This event already has a ${parsed.data.tier.replace('_', ' ')} tier.`,
      fieldErrors: { tier: ['Tier is already configured for this event.'] },
    };
  }

  const data = parsed.data;
  const payload = {
    eventId,
    tier: data.tier,
    name: data.name,
    description: data.description ?? null,
    priceMinor: data.priceMinor,
    currency: data.currency,
    quota: data.quota,
    salesStart: data.salesStart ?? null,
    salesEnd: data.salesEnd ?? null,
    paymentLinkUrl: data.paymentLinkUrl ?? null,
  };
  try {
    if (id) {
      await db.ticketType.update({ where: { id }, data: payload });
    } else {
      await db.ticketType.create({ data: payload });
    }
  } catch (err) {
    // Belt-and-suspenders against the same race the pre-check closes.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { ok: false, error: 'Tier conflict. Another admin may have just saved one.' };
    }
    captureError('[admin:upsertTicketType]', err, { eventId, id });
    return { ok: false, error: 'Could not save the ticket tier. Try again.' };
  }
  // Event slug lives one hop away — fetch to revalidate the public page.
  const event = await db.event.findUnique({ where: { id: eventId }, select: { slug: true } });
  revalidatePath(`/admin/events/${eventId}/tickets`);
  if (event) {
    revalidatePath(`/events/${event.slug}`);
    revalidatePath(`/events/${event.slug}/tickets`);
  }
  return { ok: true };
}

export type DeleteTicketTypeResult = { ok: true } | { ok: false; error: string };

export async function deleteTicketType(
  eventId: string,
  id: string,
): Promise<DeleteTicketTypeResult> {
  await requireAdmin();

  // Sold tickets reference the tier via OrderItem.ticketTypeId (required
  // FK with default Restrict). Same pattern as Event.orders — can't
  // delete a tier that has sales history, has to be zeroed-quota instead
  // or we'd lose the QR-token linkage.
  const orderItemCount = await db.orderItem.count({ where: { ticketTypeId: id } });
  if (orderItemCount > 0) {
    return {
      ok: false,
      error: `This tier has ${orderItemCount} sold ticket${orderItemCount === 1 ? '' : 's'} and can't be deleted. Set quota to 0 to stop sales while preserving the audit trail.`,
    };
  }

  try {
    await db.ticketType.delete({ where: { id } });
  } catch (err) {
    captureError('[admin:deleteTicketType]', err, { eventId, id });
    return { ok: false, error: 'Could not delete the tier. Try again.' };
  }
  const event = await db.event.findUnique({ where: { id: eventId }, select: { slug: true } });
  revalidatePath(`/admin/events/${eventId}/tickets`);
  if (event) {
    revalidatePath(`/events/${event.slug}`);
    revalidatePath(`/events/${event.slug}/tickets`);
  }
  return { ok: true };
}
