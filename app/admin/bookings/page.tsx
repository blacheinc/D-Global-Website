import Link from 'next/link';
import { db } from '@/server/db';
import { Badge } from '@/components/ui/Badge';
import { formatEventDateTime } from '@/lib/formatDate';

export default async function AdminBookingsPage() {
  const bookings = await db.booking.findMany({
    orderBy: { requestedAt: 'desc' },
    take: 100,
    include: {
      event: { select: { title: true, startsAt: true } },
      package: { select: { name: true, tier: true } },
    },
  });

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Bookings</h1>
        <p className="mt-2 text-sm text-muted">Last 100 VIP table requests.</p>
      </header>
      {bookings.length === 0 ? (
        <p className="text-sm text-muted">No bookings yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Guest</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Package</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Party</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Requested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {bookings.map((b) => (
                <tr key={b.id} className="bg-bg/50">
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    <Link href={`/admin/bookings/${b.id}`} className="hover:text-accent">
                      {b.code.slice(0, 10)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{b.guestName}</td>
                  <td className="px-4 py-3 text-muted">{b.guestPhone}</td>
                  <td className="px-4 py-3">{b.package.name}</td>
                  <td className="px-4 py-3 text-muted">{b.event?.title ?? '—'}</td>
                  <td className="px-4 py-3">{b.partySize}</td>
                  <td className="px-4 py-3">
                    <Badge>{b.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatEventDateTime(b.requestedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
