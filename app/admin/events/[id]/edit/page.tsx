import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { EventForm } from '@/features/admin/components/EventForm';

export const dynamic = 'force-dynamic';

export default async function AdminEventEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await db.event.findUnique({ where: { id } });
  if (!event) notFound();
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Edit event</h1>
        <p className="mt-2 text-sm text-muted">{event.title}</p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs uppercase tracking-[0.18em]">
          <Link
            href={`/admin/events/${id}/tickets`}
            className="text-accent hover:text-accent-hot"
          >
            Ticket tiers →
          </Link>
          <Link
            href={`/admin/events/${id}/lineup`}
            className="text-accent hover:text-accent-hot"
          >
            Lineup →
          </Link>
          <Link
            href={`/admin/events/${id}/scan`}
            className="text-accent hover:text-accent-hot"
          >
            Scanner links →
          </Link>
          <Link
            href={`/events/${event.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-foreground"
          >
            View public ↗
          </Link>
        </div>
      </header>
      <EventForm
        initial={{
          id: event.id,
          slug: event.slug,
          title: event.title,
          subtitle: event.subtitle,
          description: event.description,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          doorsAt: event.doorsAt,
          venueName: event.venueName,
          venueCity: event.venueCity,
          venueAddress: event.venueAddress,
          venueMapUrl: event.venueMapUrl,
          heroImage: event.heroImage,
          genre: event.genre,
          status: event.status,
          featured: event.featured,
        }}
      />
    </div>
  );
}
