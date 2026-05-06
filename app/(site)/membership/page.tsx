import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles, Check } from 'lucide-react';
import { db } from '@/server/db';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { formatDiscountBps } from '@/lib/membership';
import { env } from '@/lib/env';
import { getCurrentUser } from '@/server/auth';
import { getMemberDiscount } from '@/server/membership';
import { SubscribeButton } from '@/features/membership/components/SubscribeButton';

export const metadata: Metadata = {
  title: 'Membership',
  description:
    "Become a D Global member: a flat percent off every ticket and VIP table, plus first dibs on drops.",
};

// Force-dynamic so the per-request session lookup runs on every page
// view, otherwise the "you're already a member" branch wouldn't render
// for the actual visitor.
export const dynamic = 'force-dynamic';

export default async function MembershipPage() {
  const [plans, user] = await Promise.all([
    db.membershipPlan.findMany({
      where: { active: true },
      orderBy: { priceMinor: 'asc' },
    }),
    getCurrentUser(),
  ]);
  const memberDiscount = await getMemberDiscount(user?.id);

  if (plans.length === 0) {
    return (
      <section className="container-px py-14 md:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <p className="eyebrow">Membership</p>
          <h1 className="mt-4 font-display text-display-xl text-balance">
            Coming soon.
          </h1>
          <p className="mt-3 text-muted">
            We're sharpening the perks. Check back, or message us on WhatsApp to be on the list.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative">
      <div className="absolute inset-x-0 top-0 h-[60vh] gradient-radial-red pointer-events-none" />
      <div className="relative container-px py-14 md:py-20">
        <div className="max-w-3xl">
          <p className="eyebrow">Membership</p>
          <h1 className="mt-4 font-display text-display-xl text-balance">
            Your seat at every drop.
          </h1>
          <p className="mt-4 text-muted md:text-lg max-w-xl">
            Members get a flat percent off every ticket and VIP table, billed via Paystack on the
            schedule each plan sets. Cancel any time, your discount stays on through the end of
            the current period.
          </p>
        </div>

        {memberDiscount && (
          <div className="mt-8 inline-flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
            <Sparkles aria-hidden className="h-4 w-4 text-accent shrink-0" />
            <p>
              You're on <span className="font-medium">{memberDiscount.planName}</span>.{' '}
              {formatDiscountBps(memberDiscount.discountBps)} off applies automatically.{' '}
              <Link href="/account" className="underline hover:text-foreground">
                Manage in your account →
              </Link>
            </p>
          </div>
        )}

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-2xl border border-white/10 bg-surface p-6 md:p-8 flex flex-col"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.3em] text-accent">
                  {plan.slug.replace(/-/g, ' ')}
                </p>
                <Badge tone="accent">{formatDiscountBps(plan.discountBps)} off</Badge>
              </div>
              <h3 className="mt-2 font-display text-2xl md:text-3xl">{plan.name}</h3>
              {plan.tagline && <p className="mt-2 text-sm text-muted">{plan.tagline}</p>}

              <div className="mt-5 pt-5 border-t border-white/10">
                <p className="font-display text-3xl">{formatPriceMinor(plan.priceMinor, plan.currency)}</p>
                <p className="text-xs uppercase tracking-[0.22em] text-muted mt-1">
                  every {plan.intervalDays} {plan.intervalDays === 1 ? 'day' : 'days'}
                </p>
              </div>

              {plan.description && (
                <p className="mt-5 text-sm text-muted">{plan.description}</p>
              )}

              {plan.perks.length > 0 && (
                <ul className="mt-5 space-y-2 text-sm flex-1">
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2">
                      <Check aria-hidden className="mt-0.5 h-4 w-4 text-accent shrink-0" />
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 pt-5 border-t border-white/10">
                {memberDiscount ? (
                  <Button asChild variant="ghost" className="w-full sm:w-auto">
                    <Link href="/account">You're already a member</Link>
                  </Button>
                ) : env.PAYSTACK_MODE !== 'api' ? (
                  // Subscriptions require API mode (recurring billing
                  // is only initialised through /transaction/initialize
                  // with a plan code). Hide the buy button rather than
                  // surface a confusing error on click; surface a clear
                  // notice instead so admin/operator knows what to fix.
                  <p className="text-xs text-muted">
                    Subscriptions are temporarily unavailable. Message us on WhatsApp to be added
                    by hand.
                  </p>
                ) : (
                  <SubscribeButton
                    planSlug={plan.slug}
                    label={user ? 'Become a member' : 'Sign in to subscribe'}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 max-w-xl text-xs text-muted">
          Billed via Paystack with the same secured cards used at the door. Auto-renews on the
          interval shown. Cancel any time from your{' '}
          <Link href="/account" className="underline hover:text-foreground">
            account
          </Link>{' '}
          and you keep the discount through the end of the current period.
        </p>
      </div>
    </section>
  );
}
