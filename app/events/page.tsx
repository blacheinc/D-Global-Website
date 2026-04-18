import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EventCard } from '@/features/events/components/EventCard';
import { EventFilters } from '@/features/events/components/EventFilters';
import { listEvents, getAllCities, getAllGenres } from '@/features/events/queries';

export const metadata: Metadata = {
  title: 'Events',
  description: 'Discover upcoming D-Global nights — afrobeats, amapiano, house and more.',
};

interface PageProps {
  searchParams: Promise<{ when?: string; city?: string; genre?: string }>;
}

export default async function EventsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const when = params.when === 'week' || params.when === 'month' ? params.when : 'all';
  const [events, cities, genres] = await Promise.all([
    listEvents({
      when,
      city: params.city,
      genre: params.genre,
    }),
    getAllCities(),
    getAllGenres(),
  ]);

  return (
    <section className="relative">
      <div className="absolute inset-x-0 top-0 h-[60vh] gradient-radial-red pointer-events-none" />
      <div className="container-px py-14 md:py-20 relative">
        <div className="max-w-3xl">
          <p className="eyebrow">Events</p>
          <h1 className="mt-4 font-display text-display-xl text-balance">
            The nights that define the city.
          </h1>
          <p className="mt-4 text-muted md:text-lg max-w-xl">
            Curated, produced and hosted by D-Global. Grab tickets early — the best sets sell out first.
          </p>
        </div>

        <div className="mt-10">
          <Suspense fallback={<div className="h-10 w-48 rounded-full bg-white/5" />}>
            <EventFilters cities={cities} genres={genres} />
          </Suspense>
        </div>

        {events.length === 0 ? (
          <div className="mt-16 rounded-2xl border border-white/10 bg-surface p-12 text-center">
            <p className="text-muted">No events match your filters. Check back soon.</p>
          </div>
        ) : (
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {events.map((event, i) => (
              <EventCard key={event.id} event={event} priority={i < 3} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
