import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { db } from '@/server/db';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatEventDateTime } from '@/lib/formatDate';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { formatDiscountBps } from '@/lib/membership';
import { getCurrentUser } from '@/server/auth';
import { CancelMembershipSelfButton } from '@/features/membership/components/CancelMembershipSelfButton';
import { signOut } from '@/auth';

export const metadata: Metadata = {
  title: 'My account',
  // Account page is per-user, never index, even if the URL leaks.
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ ref?: string; already?: string }>;
}

export default async function AccountPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/api/auth/signin?callbackUrl=/account');
  }

  const sp = await searchParams;
  // ref=... lands here from the Paystack callback after a fresh
  // subscribe. We don't have to do anything with it (the webhook
  // creates the Membership row), but we use its presence to show a
  // welcome banner the first time around. ?already=member is set when
  // a re-subscribe attempt was bounced because they're already paid.
  const justSubscribed = Boolean(sp.ref);
  const alreadyMember = sp.already === 'member';

  const [membership, recentOrders] = await Promise.all([
    db.membership.findUnique({
      where: { userId: user.id },
      include: { plan: true },
    }),
    // A small "recent purchases" list is useful for members who want
    // to find a past ticket without digging through email.
    db.order.findMany({
      where: { userId: user.id, status: 'PAID' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        reference: true,
        totalMinor: true,
        currency: true,
        createdAt: true,
        event: { select: { title: true, slug: true } },
      },
    }),
  ]);

  const stillCovered =
    membership &&
    (membership.status === 'ACTIVE' ||
      ((membership.status === 'PAST_DUE' || membership.status === 'CANCELLED') &&
        (membership.currentPeriodEnd?.getTime() ?? 0) > Date.now()));

  return (
    <section className="container-px py-14 md:py-20">
      <div className="max-w-2xl mx-auto space-y-10">
        <header>
          <p className="eyebrow">Account</p>
          <h1 className="mt-3 font-display text-display-lg">{user.name ?? user.email}</h1>
          {user.name && <p className="text-sm text-muted mt-1">{user.email}</p>}
        </header>

        {justSubscribed && stillCovered && (
          <div className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
            <Sparkles aria-hidden className="h-4 w-4 text-accent shrink-0" />
            <p>
              You're in. Your discount is active immediately, including on the next ticket you
              buy.
            </p>
          </div>
        )}
        {alreadyMember && (
          <div className="rounded-2xl border border-white/10 bg-surface px-4 py-3 text-sm">
            You're already on a paid plan. No new subscription was started.
          </div>
        )}

        <section>
          <h2 className="font-display text-2xl mb-4">Membership</h2>
          {membership ? (
            <div className="rounded-2xl border border-white/10 bg-surface p-6 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-medium">{membership.plan.name}</p>
                  <p className="text-sm text-muted">
                    {formatPriceMinor(membership.plan.priceMinor, membership.plan.currency)} every{' '}
                    {membership.plan.intervalDays} days ·{' '}
                    {formatDiscountBps(membership.plan.discountBps)} off tickets and tables
                  </p>
                </div>
                <Badge tone={stillCovered ? 'accent' : 'muted'}>{membership.status}</Badge>
              </div>

              {membership.currentPeriodEnd && (
                <p className="text-sm text-muted">
                  {membership.status === 'CANCELLED'
                    ? 'Discount remains until '
                    : 'Renews on '}
                  <span className="text-foreground">
                    {formatEventDateTime(membership.currentPeriodEnd)}
                  </span>
                  .
                </p>
              )}

              {stillCovered && membership.status !== 'CANCELLED' && (
                <div className="pt-2 border-t border-white/10">
                  <CancelMembershipSelfButton />
                </div>
              )}

              {!stillCovered && (
                <div className="pt-2 border-t border-white/10">
                  <Button asChild variant="primary">
                    <Link href="/membership">Resubscribe</Link>
                  </Button>
                </div>
              )}
            </div>
          ) : justSubscribed ? (
            // Paystack just redirected us back here but the
            // subscription.create webhook hasn't materialised the row
            // yet. The lag is usually seconds; rather than render a
            // misleading "no membership" state we tell the user we're
            // confirming and auto-refresh once on mount via the
            // <meta http-equiv="refresh"> below.
            <div className="rounded-2xl border border-accent/40 bg-accent/10 p-6 space-y-3">
              <p className="text-sm">
                We're confirming your subscription with Paystack. This usually takes a few
                seconds, refresh in a moment if it hasn't updated.
              </p>
              {/* Auto-refresh once after 5s so the buyer doesn't have
                  to know to hit reload. eslint allows meta refresh
                  inside Next pages; it's a one-shot, not a loop. */}
              <meta httpEquiv="refresh" content="5" />
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-surface p-6 space-y-4">
              <p className="text-sm">
                You don't have an active membership. Members get a flat percent off every ticket
                and VIP table.
              </p>
              <Button asChild variant="primary">
                <Link href="/membership">See plans</Link>
              </Button>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl">Recent tickets</h2>
            <Link href="/events" className="text-sm text-muted hover:text-foreground">
              Find more →
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-muted">No tickets yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentOrders.map((o) => (
                <li key={o.id}>
                  {/* Wrap the row in a link to the buyer-side ticket
                      page. The page demands ?ref= as a capability
                      token; we have the reference already so the
                      member's QR + PDF unlock without a re-prompt. */}
                  <Link
                    href={`/tickets/${o.id}?ref=${encodeURIComponent(o.reference)}`}
                    className="block rounded-2xl border border-white/10 bg-surface p-4 hover:border-white/20 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{o.event.title}</p>
                        <p className="text-xs text-muted">
                          {formatEventDateTime(o.createdAt)} ·{' '}
                          <span className="font-mono">{o.reference.slice(0, 14)}</span>
                        </p>
                      </div>
                      <p className="text-sm font-medium shrink-0">
                        {formatPriceMinor(o.totalMinor, o.currency)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="pt-6 border-t border-white/10">
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <button
              type="submit"
              className="text-xs uppercase tracking-[0.18em] text-muted hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}
