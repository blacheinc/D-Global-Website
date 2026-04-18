import Link from 'next/link';
import { db } from '@/server/db';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatEventDateTime } from '@/lib/formatDate';
import { DeleteEventButton } from '@/features/admin/components/DeleteEventButton';

export default async function AdminEventsPage() {
  const events = await db.event.findMany({
    orderBy: { startsAt: 'desc' },
    select: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      venueName: true,
      status: true,
      featured: true,
      _count: { select: { ticketTypes: true, orders: true } },
    },
  });

  return (
    <div>
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Events</h1>
          <p className="mt-2 text-sm text-muted">{events.length} total</p>
        </div>
        <Button asChild>
          <Link href="/admin/events/new">New event</Link>
        </Button>
      </header>

      {events.length === 0 ? (
        <p className="text-sm text-muted">No events yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Venue</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Orders</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {events.map((e) => (
                <tr key={e.id} className="bg-bg/50 hover:bg-surface/40 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/admin/events/${e.id}/edit`} className="font-medium hover:text-accent">
                      {e.title}
                    </Link>
                    {e.featured && <Badge className="ml-2">Featured</Badge>}
                  </td>
                  <td className="px-4 py-3 text-muted">{formatEventDateTime(e.startsAt)}</td>
                  <td className="px-4 py-3 text-muted">{e.venueName}</td>
                  <td className="px-4 py-3 text-muted">{e.status}</td>
                  <td className="px-4 py-3 text-muted">{e._count.orders}</td>
                  <td className="px-4 py-3 text-right">
                    <DeleteEventButton id={e.id} title={e.title} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
