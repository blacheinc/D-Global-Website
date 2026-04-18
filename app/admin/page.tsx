import Link from 'next/link';
import { db } from '@/server/db';
import { Card } from '@/components/ui/Card';
import { formatPriceMinor } from '@/lib/formatCurrency';

// Lightweight overview: counts + last 30 days revenue. Heavy admin-side
// reporting belongs in dedicated routes, not this hub.

async function getStats() {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const [events, bookings, paidOrders, paidAgg] = await Promise.all([
    db.event.count(),
    db.booking.count(),
    db.order.count({ where: { status: 'PAID' } }),
    db.order.aggregate({
      where: { status: 'PAID', paidAt: { gte: since } },
      _sum: { totalMinor: true },
    }),
  ]);
  return {
    events,
    bookings,
    paidOrders,
    revenueLast30: paidAgg._sum.totalMinor ?? 0,
  };
}

export default async function AdminHomePage() {
  const stats = await getStats();
  const tiles: ReadonlyArray<{ label: string; value: string; href: string }> = [
    { label: 'Events', value: stats.events.toLocaleString('en-GH'), href: '/admin/events' },
    { label: 'Bookings', value: stats.bookings.toLocaleString('en-GH'), href: '/admin/bookings' },
    { label: 'Paid orders', value: stats.paidOrders.toLocaleString('en-GH'), href: '/admin/orders' },
    {
      label: 'Revenue · 30d',
      value: formatPriceMinor(stats.revenueLast30),
      href: '/admin/orders',
    },
  ];
  return (
    <div>
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-2 text-sm text-muted">A quick read on the night.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="block">
            <Card className="p-6">
              <p className="text-xs uppercase tracking-[0.22em] text-muted">{tile.label}</p>
              <p className="mt-3 text-2xl font-semibold">{tile.value}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
