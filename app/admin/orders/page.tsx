import Link from 'next/link';
import { db } from '@/server/db';
import { Badge } from '@/components/ui/Badge';
import { formatEventDateTime } from '@/lib/formatDate';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { paginate } from '@/lib/pagination';
import { Pagination } from '@/components/admin/Pagination';

const PAGE_SIZE = 50;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const total = await db.order.count();
  const info = paginate(sp.page, total, PAGE_SIZE);
  const orders = await db.order.findMany({
    orderBy: { createdAt: 'desc' },
    skip: info.skip,
    take: info.take,
    include: {
      event: { select: { title: true } },
      items: { select: { quantity: true } },
    },
  });

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-2 text-sm text-muted">{total} total ticket orders.</p>
      </header>
      {orders.length === 0 ? (
        <p className="text-sm text-muted">No orders yet.</p>
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
