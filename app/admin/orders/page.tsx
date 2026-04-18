import { db } from '@/server/db';
import { Badge } from '@/components/ui/Badge';
import { formatEventDateTime } from '@/lib/formatDate';
import { formatPriceMinor } from '@/lib/formatCurrency';

export default async function AdminOrdersPage() {
  const orders = await db.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      event: { select: { title: true } },
      items: { select: { quantity: true } },
    },
  });

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-2 text-sm text-muted">Last 100 ticket orders.</p>
      </header>
      {orders.length === 0 ? (
        <p className="text-sm text-muted">No orders yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Buyer</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Tickets</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {orders.map((o) => (
                <tr key={o.id} className="bg-bg/50">
                  <td className="px-4 py-3 font-mono text-xs text-muted">{o.reference}</td>
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
    </div>
  );
}
