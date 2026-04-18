import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookingStatus } from '@prisma/client';
import { db } from '@/server/db';
import { Badge } from '@/components/ui/Badge';
import { formatEventDateTime } from '@/lib/formatDate';
import { StatusSelect } from '@/features/admin/components/StatusSelect';
import { updateBookingStatus } from '@/features/admin/bookingActions';

export const dynamic = 'force-dynamic';

const STATUSES = Object.values(BookingStatus);

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const booking = await db.booking.findUnique({
    where: { id },
    include: {
      event: { select: { title: true, startsAt: true, slug: true } },
      package: { select: { name: true, tier: true } },
    },
  });
  if (!booking) notFound();

  const boundAction = updateBookingStatus.bind(null, id);

  return (
    <div>
      <header className="mb-8">
        <Link
          href="/admin/bookings"
          className="text-xs uppercase tracking-[0.18em] text-muted hover:text-foreground"
        >
          ← All bookings
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{booking.guestName}</h1>
        <p className="mt-2 text-sm text-muted">
          <span className="font-mono text-xs">{booking.code.slice(0, 10)}</span> ·{' '}
          {formatEventDateTime(booking.requestedAt)} · <Badge>{booking.status}</Badge>
        </p>
      </header>

      <dl className="grid gap-6 sm:grid-cols-2 max-w-2xl">
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Phone</dt>
          <dd className="mt-1">{booking.guestPhone}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Email</dt>
          <dd className="mt-1">{booking.guestEmail ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Package</dt>
          <dd className="mt-1">
            {booking.package.name} · {booking.package.tier}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Party size</dt>
          <dd className="mt-1">{booking.partySize}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Event</dt>
          <dd className="mt-1">
            {booking.event ? (
              <Link href={`/events/${booking.event.slug}`} className="hover:text-accent">
                {booking.event.title} — {formatEventDateTime(booking.event.startsAt)}
              </Link>
            ) : (
              '— no specific event —'
            )}
          </dd>
        </div>
        {booking.notes && (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-[0.18em] text-muted">Notes</dt>
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
