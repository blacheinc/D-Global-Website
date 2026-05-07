import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getEventBySlug } from '@/features/events/queries';
import { TicketCheckout } from '@/features/tickets/components/TicketCheckout';
import { formatEventDateTime } from '@/lib/formatDate';
import { env } from '@/lib/env';
import { getCurrentUser } from '@/server/auth';
import { getMemberDiscount } from '@/server/membership';

export const metadata: Metadata = {
  title: 'Get Tickets',
};

// Force-dynamic so the per-request member discount lookup actually runs
// on each page view, otherwise Next caches the rendered tree and the
// member never sees their discount reflected.
export const dynamic = 'force-dynamic';

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  // Discount is computed server-side, per-request, from the visitor's
  // session. Re-priced again inside the checkout API at order create
  // time so a member who signed in mid-session, or whose membership
  // expired between page load and submit, gets the correct charge.
  const user = await getCurrentUser();
  const memberDiscount = await getMemberDiscount(user?.id);

  return (
    <section className="container-px py-14 md:py-20">
      <div className="max-w-2xl mx-auto">
        <Link
          href={`/events/${event.slug}`}
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" /> Back to event
        </Link>

        <div className="mt-6">
          <p className="eyebrow">Tickets</p>
          <h1 className="mt-3 font-display text-display-lg text-balance">{event.title}</h1>
          <p className="mt-2 text-muted">
            {formatEventDateTime(event.startsAt)} · {event.venueName}, {event.venueCity}
          </p>
        </div>

        <div className="mt-10">
          <TicketCheckout
            eventId={event.id}
            ticketTypes={event.ticketTypes}
            paystackMode={env.PAYSTACK_MODE}
            memberDiscount={memberDiscount}
          />
        </div>
      </div>
    </section>
  );
}
