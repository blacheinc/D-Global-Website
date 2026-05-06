'use server';

import { z } from 'zod';
import { Prisma, MembershipStatus, Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { captureError } from '@/server/observability';
import { isStrictEmail } from '@/lib/email';

// Admin-side membership management. Phase 1 doesn't go through Paystack
// for billing yet, this is the manual-grant path used for owner comps,
// venue partners, and verifying the discount path end-to-end before the
// public signup flow lands. Once Phase 2 ships, the same Membership row
// will be populated by the subscription.create webhook instead.

const planSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Slug: lowercase letters, digits and hyphens only'),
  name: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(200).optional(),
  description: z.string().trim().max(4000).optional(),
  // Admin enters GHS, store as pesewas, same convention as TicketTypeForm.
  priceMinor: z.preprocess((v) => {
    if (v === '' || v == null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) : undefined;
  }, z.number().int().min(0).max(100_000_000)),
  currency: z.string().length(3).default('GHS'),
  intervalDays: z.coerce.number().int().min(1).max(366).default(30),
  // Discount entered as a percent (0-100), persisted as basis points
  // (0-10000) for fine-grained control. 20 -> 2000.
  discountPercent: z.preprocess((v) => {
    if (v === '' || v == null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().min(0).max(100)),
  perks: z.string().trim().max(2000).optional(),
  active: z.preprocess((v) => v === 'on' || v === true || v === 'true', z.boolean()),
});

export type MembershipPlanFormState = {
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

export async function upsertMembershipPlan(
  id: string | null,
  _prev: MembershipPlanFormState,
  formData: FormData,
): Promise<MembershipPlanFormState> {
  await requireAdmin();
  const parsed = planSchema.safeParse(emptyToUndefined(Object.fromEntries(formData.entries())));
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  const payload = {
    slug: data.slug,
    name: data.name,
    tagline: data.tagline ?? null,
    description: data.description ?? null,
    priceMinor: data.priceMinor,
    currency: data.currency,
    intervalDays: data.intervalDays,
    discountBps: Math.round(data.discountPercent * 100),
    perks: parsePerks(data.perks),
    active: data.active,
  };
  try {
    if (id) await db.membershipPlan.update({ where: { id }, data: payload });
    else await db.membershipPlan.create({ data: payload });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return {
        ok: false,
        fieldErrors: { slug: ['That slug is already taken by another plan.'] },
        error: 'Slug must be unique.',
      };
    }
    captureError('[admin:upsertMembershipPlan]', err, { id, slug: data.slug });
    return { ok: false, error: 'Could not save the plan. Try again.' };
  }
  revalidatePath('/admin/memberships');
  redirect('/admin/memberships');
}

// Admin grants a membership to an existing user (or creates the user
// row from email if they haven't signed in yet, matching how comp
// orders accept any email and the recipient claims it later by signing
// in). The granted membership is ACTIVE with a currentPeriodEnd derived
// from the plan's intervalDays.
const grantSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isStrictEmail, { message: 'Enter a valid email address.' }),
  planId: z.string().min(1, 'Choose a plan'),
  // Override the auto-computed period end so admins can hand out custom
  // durations ("3 free months for venue partner"). Optional, falls back
  // to plan.intervalDays from now.
  expiresAt: z.string().trim().optional(),
  note: z.string().trim().max(500).optional(),
});

export type GrantMembershipResult =
  | { ok: true; membershipId: string; userId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function grantMembership(
  _prev: GrantMembershipResult | null,
  formData: FormData,
): Promise<GrantMembershipResult> {
  await requireAdmin();
  const parsed = grantSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { email, planId, expiresAt, note } = parsed.data;

  const plan = await db.membershipPlan.findUnique({
    where: { id: planId },
    select: { id: true, intervalDays: true, active: true },
  });
  if (!plan) {
    return { ok: false, fieldErrors: { planId: ['Plan not found.'] }, error: 'Plan not found.' };
  }
  if (!plan.active) {
    return {
      ok: false,
      fieldErrors: { planId: ['Plan is paused. Activate it before granting memberships.'] },
      error: 'Plan is paused.',
    };
  }

  // Compute the period end. If the admin entered a date, parse it; else
  // use plan.intervalDays from now. We accept any valid Date string the
  // browser produces from <input type="date">, which is YYYY-MM-DD.
  let periodEnd: Date;
  if (expiresAt) {
    const d = new Date(expiresAt);
    if (Number.isNaN(d.getTime())) {
      return {
        ok: false,
        fieldErrors: { expiresAt: ['Invalid date.'] },
        error: 'Could not parse expiry date.',
      };
    }
    periodEnd = d;
  } else {
    periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + plan.intervalDays);
  }

  // Upsert User by email so the admin can grant before the recipient
  // has signed in. The user row owns no auth state until they sign in
  // via NextAuth (which itself will upsert by email and pick up this
  // row). Role stays GUEST so the grant doesn't accidentally promote.
  let userId: string;
  try {
    const upserted = await db.user.upsert({
      where: { email },
      update: {},
      create: { email, role: Role.GUEST },
      select: { id: true },
    });
    userId = upserted.id;
  } catch (err) {
    captureError('[admin:grantMembership] user upsert failed', err, { email });
    return { ok: false, error: 'Could not look up the user. Try again.' };
  }

  // If a membership already exists for this user we update in place
  // instead of throwing the @unique conflict, admin probably wants to
  // bump the expiry / change the plan, not see a generic error.
  try {
    const m = await db.membership.upsert({
      where: { userId },
      create: {
        userId,
        planId: plan.id,
        status: MembershipStatus.ACTIVE,
        currentPeriodEnd: periodEnd,
        adminNote: note ?? null,
      },
      update: {
        planId: plan.id,
        status: MembershipStatus.ACTIVE,
        currentPeriodEnd: periodEnd,
        cancelledAt: null,
        adminNote: note ?? null,
      },
      select: { id: true },
    });
    revalidatePath('/admin/memberships');
    return { ok: true, membershipId: m.id, userId };
  } catch (err) {
    captureError('[admin:grantMembership] membership upsert failed', err, { email, planId });
    return { ok: false, error: 'Could not grant the membership. Try again.' };
  }
}

// Cancel a membership. Sets status CANCELLED and stamps cancelledAt.
// Discount enforcement keeps applying through currentPeriodEnd (lazy
// expire flips to EXPIRED when the period passes), matching how Paystack
// auto-renew cancellations behave.
export type CancelMembershipResult = { ok: true } | { ok: false; error: string };

export async function cancelMembership(id: string): Promise<CancelMembershipResult> {
  await requireAdmin();
  try {
    await db.membership.update({
      where: { id },
      data: {
        status: MembershipStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });
  } catch (err) {
    captureError('[admin:cancelMembership]', err, { id });
    return { ok: false, error: 'Could not cancel. Try again.' };
  }
  revalidatePath('/admin/memberships');
  return { ok: true };
}
