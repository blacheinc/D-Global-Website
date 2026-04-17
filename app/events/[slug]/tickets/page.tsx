import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getEventBySlug } from '@/features/events/queries';
import { TicketCheckout } from '@/features/tickets/components/TicketCheckout';
import { formatEventDateTime } from '@/lib/formatDate';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Get Tickets',
};

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  return (
    <section className="container-px py-14 md:py-20">
      <div className="max-w-2xl mx-auto">
        <Link
          href={`/events/${event.slug}`}
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to event
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
            eventSlug={event.slug}
            ticketTypes={event.ticketTypes}
            paystackMode={env.PAYSTACK_MODE}
          />
        </div>
      </div>
    </section>
  );
}
