import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatEventDate, formatEventTime } from '@/lib/formatDate';
import { formatPriceMinor } from '@/lib/formatCurrency';
import type { Event, TicketType } from '@prisma/client';

interface EventCardProps {
  event: Event & { ticketTypes: TicketType[] };
  priority?: boolean;
}

export function EventCard({ event, priority }: EventCardProps) {
  const cheapest = event.ticketTypes[0];
  return (
    <Link
      href={`/events/${event.slug}`}
      className="group relative block overflow-hidden rounded-2xl border border-white/5 bg-surface card-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        <Image
          src={event.heroImage}
          alt=""
          aria-hidden
          fill
          priority={priority}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        <div className="absolute top-4 left-4 flex gap-2">
          {event.featured && <Badge tone="live">Featured</Badge>}
          {event.genre[0] && <Badge tone="accent">{event.genre[0]}</Badge>}
        </div>
        <div className="absolute top-4 right-4">
          <span
            aria-hidden
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent/90 text-white transition-transform group-hover:scale-110 group-hover:rotate-45"
          >
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
          <p className="text-xs uppercase tracking-[0.22em] text-accent mb-2">
            {formatEventDate(event.startsAt)} · {formatEventTime(event.startsAt)}
          </p>
          <h3 className="font-display text-2xl md:text-3xl leading-tight text-balance">
            {event.title}
          </h3>
          {event.subtitle && (
            <p className="mt-1.5 text-sm text-muted line-clamp-1">{event.subtitle}</p>
          )}
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-1.5 text-muted">
              <MapPin aria-hidden className="h-3.5 w-3.5" />
              {event.venueName}, {event.venueCity}
            </span>
            {cheapest && (
              <span className="text-foreground">
                From <span className="font-medium">{formatPriceMinor(cheapest.priceMinor)}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
