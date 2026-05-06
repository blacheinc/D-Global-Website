'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { headers } from 'next/headers';
import { db } from '@/server/db';
import { env } from '@/lib/env';
import { getCurrentUser } from '@/server/auth';
import { captureError } from '@/server/observability';
import { rateLimitHeaders } from '@/server/rateLimit';
import {
  createPaystackPlan,
  disablePaystackSubscription,
  initializeTransaction,
} from '@/server/paystack/client';
import { MembershipStatus } from '@prisma/client';
import { isStrictEmail } from '@/lib/email';

// Public-facing membership subscribe / cancel actions.
//
// Signup flow (self-serve):
//   1. /membership renders a "Become a member" button per active plan.
//   2. The button posts to subscribeMembership (this action) with the
//      slug of the plan they picked.
//   3. Action verifies session: signed-in users continue; guests are
//      redirected to the magic-link sign-in page with a callbackUrl
//      back to /membership so the round-trip is invisible.
//   4. Action ensures the chosen plan has a Paystack plan_code (created
//      lazily here, not at admin-save, so price tweaks don't orphan
//      old codes mid-flight).
//   5. Action initialises a Paystack transaction against that plan_code,
//      reference prefixed `dgsub_` so the webhook can discriminate
//      subscription transactions from ticket orders. Metadata carries
//      kind:'membership' + userId + planId for the webhook + audit.
//   6. Throws a redirect to Paystack's authorization_url. After the
//      user pays, Paystack redirects them to /account?ref=... and
//      fires charge.success + subscription.create to our webhook,
//      which materialises the Membership row.
//
// Cancel flow (self-serve):
//   - Logged-in member calls cancelMembershipSelf from /account.
//   - We disable the Paystack subscription (stops auto-renew). Local
//     state flips to CANCELLED, currentPeriodEnd stays put, the
//     discount remains applied through the end of the period (matches
//     how every commercial subscription product behaves).

const subscribeSchema = z.object({
  planSlug: z.string().trim().toLowerCase().min(1).max(80),
});

export type SubscribeMembershipResult = { ok: false; error: string };

// On success this action throws a redirect, so the caller never sees
// an ok:true return. Result type only carries the failure shape.
export async function subscribeMembership(
  _prev: SubscribeMembershipResult | null,
  formData: FormData,
): Promise<SubscribeMembershipResult> {
  // Rate limit so a stuck retry loop or scripted abuse can't spam
  // Paystack's plan/transaction endpoints. 5/min/IP is generous for a
  // human signup retry, tight against scripted abuse.
  const h = await headers();
  const rl = rateLimitHeaders(h, 'membership-subscribe', 5, 60 * 1000);
  if (!rl.ok) {
    return { ok: false, error: 'Too many signup attempts. Try again in a minute.' };
  }

  const parsed = subscribeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: 'Pick a plan to continue.' };
  }
  const { planSlug } = parsed.data;

  // Auth gate: route guests through the magic-link flow with a
  // callbackUrl back to /membership so the post-signup redirect lands
  // them right back where they started.
  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(`/membership?plan=${planSlug}`)}`,
    );
  }
  if (!user.email || !isStrictEmail(user.email)) {
    return {
      ok: false,
      error:
        'Your account email looks invalid to Paystack. Sign out, sign back in with a different address, and try again.',
    };
  }

  if (env.PAYSTACK_MODE !== 'api') {
    return {
      ok: false,
      error:
        'Subscription billing requires PAYSTACK_MODE=api. Ask the platform admin to flip the env var.',
    };
  }

  const plan = await db.membershipPlan.findUnique({ where: { slug: planSlug } });
  if (!plan || !plan.active) {
    return { ok: false, error: 'That plan is not currently available.' };
  }

  // Already a paying member? Skip the round-trip and bounce to /account.
  const existing = await db.membership.findUnique({
    where: { userId: user.id },
    select: { status: true, currentPeriodEnd: true, paystackSubscriptionCode: true },
  });
  const stillCovered =
    existing &&
    (existing.status === MembershipStatus.ACTIVE ||
      ((existing.status === MembershipStatus.PAST_DUE ||
        existing.status === MembershipStatus.CANCELLED) &&
        (existing.currentPeriodEnd?.getTime() ?? 0) > Date.now()));
  if (stillCovered && existing.paystackSubscriptionCode) {
    redirect('/account?already=member');
  }

  // Lazy plan provisioning: create the Paystack Plan if we haven't
  // already cached its plan_code. Saved back to the DB so subsequent
  // signups skip the round-trip.
  let planCode = plan.paystackPlanCode;
  if (!planCode) {
    try {
      const created = await createPaystackPlan({
        name: plan.name,
        amountMinor: plan.priceMinor,
        interval: dayCountToPaystackInterval(plan.intervalDays),
        currency: plan.currency,
      });
      planCode = created.data.plan_code;
      await db.membershipPlan.update({
        where: { id: plan.id },
        data: { paystackPlanCode: planCode },
      });
    } catch (err) {
      captureError('[membership:subscribe] paystack plan create failed', err, {
        planId: plan.id,
        slug: plan.slug,
      });
      return {
        ok: false,
        error: 'Could not start your subscription. Try again, or message us on WhatsApp.',
      };
    }
  }

  const reference = `dgsub_${randomUUID().replace(/-/g, '')}`;
  const callback = `${env.NEXT_PUBLIC_SITE_URL}/account?ref=${reference}`;
  try {
    const init = await initializeTransaction({
      email: user.email,
      amountMinor: plan.priceMinor,
      reference,
      callbackUrl: callback,
      planCode,
      metadata: {
        kind: 'membership',
        userId: user.id,
        planId: plan.id,
        planSlug: plan.slug,
      },
    });
    redirect(init.data.authorization_url);
  } catch (err) {
    // Next.js redirect() throws an internal error we shouldn't catch.
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
    captureError('[membership:subscribe] paystack init failed', err, {
      userId: user.id,
      planSlug: plan.slug,
    });
    return {
      ok: false,
      error: 'Paystack is not responding right now. Try again in a moment.',
    };
  }
}

// Self-service cancel for the signed-in member. Stops auto-renew
// upstream + flips local status to CANCELLED. currentPeriodEnd stays
// put so the discount keeps applying through the end of the billing
// period (lazy expiry takes over once the timestamp passes).
export type CancelMembershipSelfResult = { ok: true } | { ok: false; error: string };

export async function cancelMembershipSelf(): Promise<CancelMembershipSelfResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Sign in to manage your membership.' };

  const m = await db.membership.findUnique({ where: { userId: user.id } });
  if (!m) return { ok: false, error: 'No active membership.' };
  if (m.status === MembershipStatus.CANCELLED || m.status === MembershipStatus.EXPIRED) {
    return { ok: false, error: 'Already cancelled.' };
  }

  // Best-effort upstream disable. If Paystack is down we still flip
  // local state, otherwise the member keeps getting charged. Worst
  // case: a phantom auto-renew lands and we'll need to refund manually,
  // but the local state is the source of truth for discount enforcement
  // and the member's view of their account.
  if (m.paystackSubscriptionCode && m.paystackEmailToken) {
    try {
      await disablePaystackSubscription({
        code: m.paystackSubscriptionCode,
        token: m.paystackEmailToken,
      });
    } catch (err) {
      captureError('[membership:cancelSelf] paystack disable failed', err, {
        membershipId: m.id,
        subscriptionCode: m.paystackSubscriptionCode,
      });
      // Don't return the error to the user; flip local state anyway.
    }
  }

  try {
    await db.membership.update({
      where: { id: m.id },
      data: { status: MembershipStatus.CANCELLED, cancelledAt: new Date() },
    });
  } catch (err) {
    captureError('[membership:cancelSelf] DB update failed', err, { membershipId: m.id });
    return { ok: false, error: 'Could not cancel locally. Try again.' };
  }
  revalidatePath('/account');
  revalidatePath('/admin/memberships');
  return { ok: true };
}

// Map our intervalDays to Paystack's named intervals. Paystack rejects
// arbitrary day counts, so we round to the closest supported bucket.
// 30d default → monthly; 7d → weekly; 90d-180d → biannually (the
// closest fit since Paystack has no quarterly); 365d → annually.
function dayCountToPaystackInterval(
  days: number,
): 'monthly' | 'biannually' | 'annually' | 'weekly' | 'daily' {
  if (days <= 1) return 'daily';
  if (days <= 8) return 'weekly';
  if (days <= 35) return 'monthly';
  if (days <= 200) return 'biannually';
  return 'annually';
}

