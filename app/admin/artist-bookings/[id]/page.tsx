import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArtistBookingStatus } from '@prisma/client';
import { db } from '@/server/db';
import { Badge } from '@/components/ui/Badge';
import { formatEventDateTime } from '@/lib/formatDate';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { StatusSelect } from '@/features/admin/components/StatusSelect';
import { updateArtistBookingStatus } from '@/features/artistBookings/actions';

export const dynamic = 'force-dynamic';

const STATUSES = Object.values(ArtistBookingStatus);

export default async function AdminArtistBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const booking = await db.artistBooking.findUnique({
    where: { id },
    include: {
      artist: { select: { stageName: true, slug: true } },
    },
  });
  if (!booking) notFound();

  const boundAction = updateArtistBookingStatus.bind(null, id);

  return (
    <div>
      <header className="mb-8">
        <Link
          href="/admin/artist-bookings"
          className="text-xs uppercase tracking-[0.18em] text-muted hover:text-foreground"
        >
          ← All artist bookings
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {booking.artist.stageName}
        </h1>
        <p className="mt-2 text-sm text-muted">
          <span className="font-mono text-xs">{booking.code.slice(0, 10)}</span> ·{' '}
          {formatEventDateTime(booking.requestedAt)} · <Badge>{booking.status}</Badge>
        </p>
      </header>

      <dl className="grid gap-6 sm:grid-cols-2 max-w-2xl">
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Requester</dt>
          <dd className="mt-1">{booking.requesterName}</dd>
          {booking.company && <dd className="text-xs text-muted">{booking.company}</dd>}
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Email</dt>
          <dd className="mt-1">
            <a href={`mailto:${booking.requesterEmail}`} className="hover:text-accent">
              {booking.requesterEmail}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Phone</dt>
          <dd className="mt-1">
            <a href={`tel:${booking.requesterPhone}`} className="hover:text-accent">
              {booking.requesterPhone}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Show date</dt>
          <dd className="mt-1">{formatEventDateTime(booking.eventDate)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Budget</dt>
          <dd className="mt-1">
            {booking.budgetMinor != null
              ? formatPriceMinor(booking.budgetMinor, booking.currency)
              : '- not specified -'}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Venue</dt>
          <dd className="mt-1">
            {booking.venueName}, {booking.city}, {booking.country}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Artist page</dt>
          <dd className="mt-1">
            <Link href={`/artists/${booking.artist.slug}`} className="hover:text-accent">
              /artists/{booking.artist.slug}
            </Link>
          </dd>
        </div>
        {booking.notes && (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-[0.18em] text-muted">Brief</dt>
            <dd className="mt-1 whitespace-pre-wrap">{booking.notes}</dd>
          </div>
        )}
      </dl>

      <section className="mt-12 border-t border-white/10 pt-10 max-w-2xl">
        <h2 className="mb-4 text-lg font-semibold">Update status</h2>
        <StatusSelect current={booking.status} options={STATUSES} action={boundAction} />
      </section>
    </div>
  );
}
