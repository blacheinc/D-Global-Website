import Link from 'next/link';
import { db } from '@/server/db';
import { Badge } from '@/components/ui/Badge';
import { formatEventDateTime } from '@/lib/formatDate';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { paginate } from '@/lib/pagination';
import { Pagination } from '@/components/admin/Pagination';

const PAGE_SIZE = 50;

export default async function AdminArtistBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const total = await db.artistBooking.count();
  const info = paginate(sp.page, total, PAGE_SIZE);
  const bookings = await db.artistBooking.findMany({
    orderBy: { requestedAt: 'desc' },
    skip: info.skip,
    take: info.take,
    include: {
      artist: { select: { stageName: true, slug: true } },
    },
  });

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Artist bookings</h1>
        <p className="mt-2 text-sm text-muted">
          {total} total label booking request{total === 1 ? '' : 's'}.
        </p>
      </header>
      {bookings.length === 0 ? (
        <p className="text-sm text-muted">No artist booking requests yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Code</th>
                <th scope="col" className="px-4 py-3 font-medium">Requester</th>
                <th scope="col" className="px-4 py-3 font-medium">Artist</th>
                <th scope="col" className="px-4 py-3 font-medium">Show</th>
                <th scope="col" className="px-4 py-3 font-medium">Budget</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {bookings.map((b) => (
                <tr key={b.id} className="bg-bg/50">
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    <Link
                      href={`/admin/artist-bookings/${b.id}`}
                      className="hover:text-accent"
                    >
                      {b.code.slice(0, 10)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div>{b.requesterName}</div>
                    <div className="text-xs text-muted">{b.company ?? b.requesterEmail}</div>
                  </td>
                  <td className="px-4 py-3">{b.artist.stageName}</td>
                  <td className="px-4 py-3 text-muted">
                    <div>{formatEventDateTime(b.eventDate)}</div>
                    <div className="text-xs">
                      {b.venueName}, {b.city}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {b.budgetMinor != null
                      ? formatPriceMinor(b.budgetMinor, b.currency)
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{b.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">
                    {formatEventDateTime(b.requestedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination info={info} basePath="/admin/artist-bookings" searchParams={sp} />
    </div>
  );
}
