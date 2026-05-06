import 'server-only';
import { db } from '@/server/db';
import { MembershipStatus } from '@prisma/client';
import type { MemberDiscount } from '@/lib/membership';

// Read-side resolver for the active member discount. Hot path (runs on
// every checkout render and on every order-create round-trip) so the
// query is lean: one Membership lookup + a status check, no joins past
// the plan summary.
//
// Discount eligibility:
//   ACTIVE      eligible
//   PAST_DUE    eligible during the grace window (currentPeriodEnd > now).
//               Paystack retries the renewal automatically; punishing the
//               member at checkout for a transient card decline is the
//               wrong UX. Once currentPeriodEnd lapses we lazy-flip them
//               to EXPIRED below and they lose the discount.
//   CANCELLED   eligible while currentPeriodEnd > now (they paid for the
//               full period; cancelling stops auto-renew, not access).
//   EXPIRED     never eligible.
//
// Lazy expiry: if currentPeriodEnd is in the past and the row isn't
// already EXPIRED, we flip on read rather than running a cron. Write is
// fire-and-forget so the caller never waits on it.

export async function getMemberDiscount(
  userId: string | null | undefined,
): Promise<MemberDiscount | null> {
  if (!userId) return null;
  const m = await db.membership.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      currentPeriodEnd: true,
      plan: { select: { slug: true, name: true, discountBps: true, active: true } },
    },
  });
  if (!m) return null;
  // Plan paused by admin — stop applying the discount immediately while
  // keeping the row so a re-activation doesn't lose history.
  if (!m.plan.active) return null;
  if (m.status === MembershipStatus.EXPIRED) return null;

  const now = Date.now();
  const periodEndMs = m.currentPeriodEnd?.getTime() ?? 0;
  const eligible =
    m.status === MembershipStatus.ACTIVE ||
    ((m.status === MembershipStatus.PAST_DUE || m.status === MembershipStatus.CANCELLED) &&
      periodEndMs > now);

  if (!eligible) {
    // Lazy expire so the next read short-circuits and the admin UI
    // reflects reality without a cron. We already returned early for
    // status === EXPIRED above, so reaching here means ACTIVE / PAST_DUE
    // / CANCELLED with a lapsed period — always worth flipping.
    void db.membership
      .update({ where: { id: m.id }, data: { status: MembershipStatus.EXPIRED } })
      .catch(() => {
        // No-op: another request will retry on the next read.
      });
    return null;
  }

  return {
    membershipId: m.id,
    planSlug: m.plan.slug,
    planName: m.plan.name,
    discountBps: m.plan.discountBps,
  };
}
