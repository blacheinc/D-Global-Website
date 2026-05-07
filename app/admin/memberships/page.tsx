import Link from 'next/link';
import { db } from '@/server/db';
import { Badge } from '@/components/ui/Badge';
import { formatEventDateTime } from '@/lib/formatDate';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { formatDiscountBps } from '@/lib/membership';
import { MembershipPlanForm } from '@/features/admin/components/MembershipPlanForm';
import { GrantMembershipForm } from '@/features/admin/components/GrantMembershipForm';
import { CancelMembershipButton } from '@/features/admin/components/CancelMembershipButton';

export const dynamic = 'force-dynamic';

// Phase 1 scope for the membership feature lives on this single page:
//   1. Plan editor (single plan today; the schema accepts more later
//      and we'll grow the UI when that materialises).
//   2. Manual grant form (used for owner comps, venue partners, and
//      verifying the discount path before Paystack billing is wired).
//   3. List of every member with status + period end + admin note.
//
// Once the public Paystack signup flow ships, Membership rows will also
// be created by the subscription.create webhook, the list and statuses
// here render the same way regardless of how the row got created.

export default async function AdminMembershipsPage() {
  const [plan, memberships] = await Promise.all([
    // Single plan today: the first one created. When we grow to multi-
    // tier, this page becomes a list and each plan gets its own
    // /admin/memberships/plans/[id] editor.
    db.membershipPlan.findFirst({ orderBy: { createdAt: 'asc' } }),
    db.membership.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        plan: { select: { name: true, discountBps: true } },
        user: { select: { email: true, name: true } },
      },
      take: 200,
    }),
  ]);
  const plans = plan ? [plan] : [];

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Memberships</h1>
        <p className="mt-2 text-sm text-muted max-w-2xl">
          Members get a flat percent discount on tickets and tables. Configure the plan once, then
          grant memberships manually (Phase 1) or via Paystack signup (Phase 2). Discount applies
          immediately on the next page load for the member.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold">Plan</h2>
        <MembershipPlanForm plan={plan} />
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold">Grant a membership</h2>
        <GrantMembershipForm plans={plans} />
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Members ({memberships.length})</h2>
        </div>
        {memberships.length === 0 ? (
          <p className="text-sm text-muted">No memberships granted yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Member</th>
                  <th scope="col" className="px-4 py-3 font-medium">Plan</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Period ends</th>
                  <th scope="col" className="px-4 py-3 font-medium">Started</th>
                  <th scope="col" className="px-4 py-3 font-medium">Note</th>
                  <th scope="col" className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {memberships.map((m) => {
                  const isStillCovered =
                    (m.status === 'ACTIVE' ||
                      m.status === 'PAST_DUE' ||
                      m.status === 'CANCELLED') &&
                    (m.currentPeriodEnd?.getTime() ?? 0) > Date.now();
                  return (
                    <tr key={m.id} className="bg-bg/50">
                      <td className="px-4 py-3">
                        <div>{m.user.name ?? m.user.email}</div>
                        {m.user.name && (
                          <div className="text-xs text-muted">{m.user.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {m.plan.name} ({formatDiscountBps(m.plan.discountBps)})
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={isStillCovered ? 'accent' : 'muted'}>{m.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted text-xs">
                        {m.currentPeriodEnd ? formatEventDateTime(m.currentPeriodEnd) : '-'}
                      </td>
                      <td className="px-4 py-3 text-muted text-xs">
                        {formatEventDateTime(m.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted max-w-xs truncate">
                        {m.adminNote ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {m.status !== 'CANCELLED' && m.status !== 'EXPIRED' && (
                          <CancelMembershipButton id={m.id} email={m.user.email} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {plan && (
              <div className="bg-surface/40 px-4 py-3 text-xs text-muted">
                Plan price: {formatPriceMinor(plan.priceMinor, plan.currency)} every{' '}
                {plan.intervalDays} days. Discount: {formatDiscountBps(plan.discountBps)}.
                {!plan.active && ' Plan is paused, discount is suspended for everyone.'}
              </div>
            )}
          </div>
        )}
      </section>

      <p className="mt-8 text-xs text-muted">
        Public Paystack signup, member dashboard, and the rest of the auto-billing flow land in
        Phase 2.{' '}
        <Link href="/admin/orders" className="hover:text-foreground">
          Orders →
        </Link>
      </p>
    </div>
  );
}
