import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Calendar, Clock, MapPin, Ticket } from 'lucide-react';
import { getEventBySlug, getAllEventSlugs } from '@/features/events/queries';
import { EventCountdown } from '@/features/events/components/EventCountdown';
import { EventMap } from '@/features/events/components/EventMap';
import { LineupList } from '@/features/events/components/LineupList';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Reveal } from '@/components/motion/Reveal';
import { formatEventDate, formatEventDateTime, formatEventTime } from '@/lib/formatDate';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { buildWaLink, buildEventInquiryMessage } from '@/lib/whatsapp';

export async function generateStaticParams() {
  const slugs = await getAllEventSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return { title: 'Event not found' };
  return {
    title: event.title,
    description: event.subtitle ?? event.description.slice(0, 160),
    openGraph: {
      title: event.title,
      description: event.subtitle ?? event.description.slice(0, 160),
      images: [event.heroImage],
    },
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  const cheapest = event.ticketTypes[0];

  return (
    <article>
      <section className="relative h-[65vh] md:h-[80vh] w-full overflow-hidden">
        <Image
          src={event.heroImage}
          alt={event.title}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/30" />
        <div className="absolute inset-0 bg-noise opacity-30 mix-blend-overlay" />
        <div className="container container-px absolute inset-x-0 bottom-0 pb-10 md:pb-16">
          <Reveal>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {event.featured && <Badge tone="live">Featured</Badge>}
              {event.genre.map((g) => (
                <Badge key={g} tone="accent">
                  {g}
                </Badge>
              ))}
            </div>
            <p className="eyebrow">{formatEventDate(event.startsAt)}</p>
            <h1 className="mt-3 font-display text-display-2xl text-balance max-w-5xl">
              {event.title}
            </h1>
            {event.subtitle && (
              <p className="mt-3 md:text-lg text-muted max-w-2xl">{event.subtitle}</p>
            )}
          </Reveal>
        </div>
      </section>

      <section className="container container-px py-14 md:py-20 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 lg:gap-16">
        <div className="space-y-12">
          <Reveal>
            <EventCountdown target={event.startsAt} />
          </Reveal>

          <Reveal>
            <div>
              <h2 className="font-display text-display-lg mb-5">About this night</h2>
              <p className="text-muted leading-relaxed whitespace-pre-line max-w-prose">
                {event.description}
              </p>
            </div>
          </Reveal>

          {event.lineup.length > 0 && (
            <Reveal>
              <div>
                <p className="eyebrow mb-4">Lineup</p>
                <LineupList lineup={event.lineup} />
              </div>
            </Reveal>
          )}

          <Reveal>
            <div>
              <p className="eyebrow mb-4">Venue</p>
              <EventMap
                embedUrl={event.venueMapUrl}
                venueName={event.venueName}
                address={event.venueAddress}
              />
              <div className="mt-4 flex items-start gap-3 text-sm text-muted">
                <MapPin aria-hidden className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                <div>
                  <p className="text-foreground">{event.venueName}</p>
                  <p>
                    {event.venueAddress ? `${event.venueAddress}, ` : ''}
                    {event.venueCity}
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        <aside className="lg:sticky lg:top-24 h-max space-y-5">
          <div className="rounded-2xl border border-white/10 bg-surface p-6 space-y-5">
            <div className="space-y-3 pb-5 border-b border-white/10">
              <div className="flex items-center gap-3 text-sm">
                <Calendar aria-hidden className="h-4 w-4 text-accent" />
                <span>{formatEventDateTime(event.startsAt)}</span>
              </div>
              {event.doorsAt && (
                <div className="flex items-center gap-3 text-sm">
                  <Clock aria-hidden className="h-4 w-4 text-accent" />
                  <span>Doors {formatEventTime(event.doorsAt)}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <MapPin aria-hidden className="h-4 w-4 text-accent" />
                <span>
                  {event.venueName}, {event.venueCity}
                </span>
              </div>
            </div>

            {cheapest && (
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-muted">Tickets from</p>
                <p className="font-display text-3xl mt-1">
                  {formatPriceMinor(cheapest.priceMinor)}
                </p>
              </div>
            )}

            <div className="grid gap-3">
              <Button asChild variant="primary" size="lg">
                <Link href={`/events/${event.slug}/tickets`}>
                  <Ticket aria-hidden className="h-4 w-4" /> Get Tickets
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href={`/bookings?event=${event.slug}`}>Book VIP Table</Link>
              </Button>
              <a
                href={buildWaLink(buildEventInquiryMessage(event.title))}
                target="_blank"
                rel="noopener noreferrer"
                className="text-center text-xs text-muted hover:text-foreground underline underline-offset-4"
              >
                Or ask on WhatsApp <span aria-hidden>→</span>
              </a>
            </div>
          </div>
        </aside>
      </section>
    </article>
  );
}
