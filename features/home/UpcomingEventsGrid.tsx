import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { EventCard } from '@/features/events/components/EventCard';
import { getUpcomingEvents } from '@/features/events/queries';
import { Reveal } from '@/components/motion/Reveal';

export async function UpcomingEventsGrid() {
  const events = await getUpcomingEvents({ take: 6 });
  if (events.length === 0) return null;

  return (
    <section className="container container-px section-y">
      <Reveal>
        <div className="flex items-end justify-between gap-6 flex-wrap mb-10">
          <div>
            <p className="eyebrow">Upcoming</p>
            <h2 className="mt-4 font-display text-display-xl text-balance max-w-xl">
              The next nights we're throwing.
            </h2>
          </div>
          <Link
            href="/events"
            className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent-hot"
          >
            See all events <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {events.map((event, i) => (
          <Reveal key={event.id} delay={i * 0.08}>
            <EventCard event={event} priority={i < 3} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
