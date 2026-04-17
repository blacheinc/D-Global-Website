import type { Metadata } from 'next';
import { db } from '@/server/db';
import { BookingForm } from '@/features/bookings/components/BookingForm';
import { EventStatus } from '@prisma/client';

export const metadata: Metadata = {
  title: 'Book a VIP Table',
  description:
    'Reserve a VIP table at the next D-Global night. Silver, Gold or Platinum — your call.',
};

interface PageProps {
  searchParams: Promise<{ pkg?: string; event?: string }>;
}

export default async function BookingsPage({ searchParams }: PageProps) {
  const { pkg, event } = await searchParams;

  const [packages, events] = await Promise.all([
    db.package.findMany({
      where: { active: true },
      orderBy: { priceMinor: 'asc' },
    }),
    db.event.findMany({
      where: { status: EventStatus.PUBLISHED, startsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      select: { id: true, slug: true, title: true, startsAt: true },
    }),
  ]);

  const defaultEventId = event ? events.find((e) => e.slug === event)?.id : undefined;

  return (
    <section className="relative">
      <div className="absolute inset-x-0 top-0 h-[60vh] gradient-radial-red pointer-events-none" />
      <div className="relative container-px py-14 md:py-20">
        <div className="max-w-3xl">
          <p className="eyebrow">VIP Tables</p>
          <h1 className="mt-4 font-display text-display-xl text-balance">
            Reserve your corner of the night.
          </h1>
          <p className="mt-4 text-muted md:text-lg max-w-xl">
            Table-side service. Premium bottles. The best sightlines. Choose a package — our team
            confirms on WhatsApp within the hour.
          </p>
        </div>

        <div className="mt-12 max-w-5xl">
          <BookingForm
            packages={packages}
            events={events}
            defaultPackageTier={pkg?.toUpperCase()}
            defaultEventId={defaultEventId}
          />
        </div>
      </div>
    </section>
  );
}
