'use server';

import { z } from 'zod';
import { Prisma, PackageTier } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { captureError } from '@/server/observability';

const packageSchema = z.object({
  tier: z.nativeEnum(PackageTier),
  name: z.string().min(1).max(120),
  tagline: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
  priceMinor: z.coerce.number().int().min(0).max(100_000_000),
  currency: z.string().length(3).default('GHS'),
  // Perks arrive as a textarea (one per line) for ergonomics; we split
  // and filter blanks.
  perks: z.string().max(2000).optional(),
  maxGuests: z.coerce.number().int().min(1).max(100),
  bottlesIncl: z.coerce.number().int().min(0).max(100).default(0),
  heroImage: z.string().url().max(500).optional(),
  active: z.preprocess((v) => v === 'on' || v === true || v === 'true', z.boolean()),
});

export type PackageFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function emptyToUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === '' ? undefined : v;
  return out as Partial<T>;
}

function parsePerks(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function upsertPackage(
  id: string | null,
  _prev: PackageFormState,
  formData: FormData,
): Promise<PackageFormState> {
  await requireAdmin();
  const parsed = packageSchema.safeParse(emptyToUndefined(Object.fromEntries(formData.entries())));
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;

  // Tier is globally unique (schema: `tier PackageTier @unique`). Pre-check
  // + P2002 catch for the same race pattern as Event slug.
  const collision = await db.package.findFirst({
    where: { tier: data.tier, NOT: id ? { id } : undefined },
    select: { id: true },
  });
  if (collision) {
    return {
      ok: false,
      fieldErrors: { tier: ['A package with this tier already exists.'] },
      error: 'That tier is already configured.',
    };
  }

  const payload = {
    tier: data.tier,
    name: data.name,
    tagline: data.tagline ?? null,
    description: data.description ?? null,
    priceMinor: data.priceMinor,
    currency: data.currency,
    perks: parsePerks(data.perks),
    maxGuests: data.maxGuests,
    bottlesIncl: data.bottlesIncl,
    heroImage: data.heroImage ?? null,
    active: data.active,
  };
  try {
    if (id) await db.package.update({ where: { id }, data: payload });
    else await db.package.create({ data: payload });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return {
        ok: false,
        fieldErrors: { tier: ['A package with this tier already exists.'] },
        error: 'That tier is already configured.',
      };
    }
    captureError('[admin:upsertPackage]', err, { id, tier: data.tier });
    return { ok: false, error: 'Could not save the package. Try again.' };
  }
  revalidatePath('/admin/packages');
  revalidatePath('/bookings');
  redirect('/admin/packages');
}

export type DeletePackageResult = { ok: true } | { ok: false; error: string };

export async function deletePackage(id: string): Promise<DeletePackageResult> {
  await requireAdmin();

  // Booking.packageId is a required FK (default Restrict). If any booking
  // references this package, hard-delete fails. Offer the same mitigation
  // we do for Events: set `active=false` to stop new bookings without
  // losing history.
  const bookingCount = await db.booking.count({ where: { packageId: id } });
  if (bookingCount > 0) {
    return {
      ok: false,
      error: `This package has ${bookingCount} booking${bookingCount === 1 ? '' : 's'} and can't be deleted. Toggle it to inactive instead to stop new bookings.`,
    };
  }
  try {
    await db.package.delete({ where: { id } });
  } catch (err) {
    captureError('[admin:deletePackage]', err, { id });
    return { ok: false, error: 'Could not delete the package. Try again.' };
  }
  revalidatePath('/admin/packages');
  revalidatePath('/bookings');
  return { ok: true };
}
