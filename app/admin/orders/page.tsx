import Link from 'next/link';
import { OrderStatus, Prisma } from '@prisma/client';
import { db } from '@/server/db';
import { Badge } from '@/components/ui/Badge';
import { formatEventDateTime } from '@/lib/formatDate';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { paginate } from '@/lib/pagination';
import { Pagination } from '@/components/admin/Pagination';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

// By default the dashboard shows only PAID orders — those are the
// actually-sold tickets operations care about. Pending/failed/expired
// rows are inventory noise (most are abandoned carts), but ops still
// occasionally need them (stuck-payment investigations, reconciling a
// webhook no-show). Pass ?status=all to see every row, or ?status=PENDING
// to drill into a specific bucket.

type StatusFilter = OrderStatus | 'ALL';

function parseFilter(raw: string | string[] | undefined): StatusFilter {
  const value = typeof raw === 'string' ? raw.toUpperCase() : '';
  if (value === 'ALL') return 'ALL';
  if ((Object.values(OrderStatus) as string[]).includes(value)) {
    return value as OrderStatus;
  }
  return 'PAID';
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = parseFilter(sp.status);

  const where: Prisma.OrderWhereInput = filter === 'ALL' ? {} : { status: filter };

  const total = await db.order.count({ where });
  const info = paginate(sp.page, total, PAGE_SIZE);
  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: info.skip,
    take: info.take,
    include: {
      event: { select: { title: true } },
      items: { select: { quantity: true } },
    },
  });

  const tabs: ReadonlyArray<{ key: StatusFilter; label: string }> = [
    { key: 'PAID', label: 'Paid' },
    { key: 'REFUNDED', label: 'Refunded' },
    { key: 'PENDING', label: 'Pending' },
    { key: 'FAILED', label: 'Failed' },
    { key: 'EXPIRED', label: 'Expired' },
    { key: 'ALL', label: 'All' },
  ];

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-2 text-sm text-muted">
          {total} {filter === 'ALL' ? 'order' : `${filter.toLowerCase()} order`}
          {total === 1 ? '' : 's'}.
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Filter orders by status">
        {tabs.map((tab) => {
          const active = tab.key === filter;
          const href = tab.key === 'PAID' ? '/admin/orders' : `/admin/orders?status=${tab.key}`;
          return (
            <Link
              key={tab.key}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'rounded-full bg-accent px-3 py-1 text-xs font-medium text-white'
                  : 'rounded-full border border-white/10 bg-surface px-3 py-1 text-xs text-muted hover:border-white/20 hover:text-foreground'
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {orders.length === 0 ? (
        <p className="text-sm text-muted">
          {filter === 'PAID' ? 'No paid orders yet.' : `No ${filter.toLowerCase()} orders.`}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Reference</th>
                <th scope="col" className="px-4 py-3 font-medium">Buyer</th>
                <th scope="col" className="px-4 py-3 font-medium">Event</th>
                <th scope="col" className="px-4 py-3 font-medium">Tickets</th>
                <th scope="col" className="px-4 py-3 font-medium">Total</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {orders.map((o) => (
                <tr key={o.id} className="bg-bg/50">
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    <Link href={`/admin/orders/${o.id}`} className="hover:text-accent">
                      {o.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div>{o.buyerName}</div>
                    <div className="text-xs text-muted">{o.buyerEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{o.event.title}</td>
                  <td className="px-4 py-3">{o.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                  <td className="px-4 py-3">{formatPriceMinor(o.totalMinor, o.currency)}</td>
                  <td className="px-4 py-3">
                    <Badge>{o.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatEventDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination info={info} basePath="/admin/orders" searchParams={sp} />
    </div>
  );
}
