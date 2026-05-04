import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { Badge } from '@/components/ui/Badge';
import { formatEventDateTime } from '@/lib/formatDate';
import { ComplimentaryOrderForm } from '@/features/admin/components/ComplimentaryOrderForm';

export const dynamic = 'force-dynamic';

const RECENT_LIMIT = 30;

export default async function AdminEventCompsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await db.event.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      ticketTypes: {
        orderBy: { priceMinor: 'asc' },
        select: {
          id: true,
          name: true,
          tier: true,
          priceMinor: true,
          quota: true,
          sold: true,
        },
      },
    },
  });
  if (!event) notFound();

  const recentComps = await db.order.findMany({
    where: { eventId: id, isComplimentary: true },
    orderBy: { createdAt: 'desc' },
    take: RECENT_LIMIT,
    select: {
      id: true,
      reference: true,
      buyerName: true,
      buyerEmail: true,
      compNote: true,
      createdAt: true,
      status: true,
      items: { select: { quantity: true, ticketType: { select: { name: true } } } },
    },
  });

  return (
    <div>
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">
          <Link href={`/admin/events/${id}/edit`} className="hover:text-foreground">
            ← {event.title}
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Complimentary tickets</h1>
        <p className="mt-2 text-sm text-muted max-w-2xl">
          Issue free tickets for press, talent guests, or owner gifts. Comp orders are stamped
          PAID immediately, signed QR tokens are generated, and the recipient gets the same
          confirmation email a paying buyer receives — with a "Complimentary tickets for"
          subject so they know it's a gift. Comps consume real seats off the tier quota.
        </p>
      </header>

      <section className="mb-12">
        <ComplimentaryOrderForm eventId={id} tiers={event.ticketTypes} />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Recent comps</h2>
        {recentComps.length === 0 ? (
          <p className="text-sm text-muted">No complimentary tickets issued for this event yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Reference</th>
                  <th scope="col" className="px-4 py-3 font-medium">Recipient</th>
                  <th scope="col" className="px-4 py-3 font-medium">Tier</th>
                  <th scope="col" className="px-4 py-3 font-medium">Qty</th>
                  <th scope="col" className="px-4 py-3 font-medium">Note</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentComps.map((c) => {
                  const qty = c.items.reduce((sum, i) => sum + i.quantity, 0);
                  const tierName = c.items[0]?.ticketType.name ?? '—';
                  return (
                    <tr key={c.id} className="bg-bg/50">
                      <td className="px-4 py-3 font-mono text-xs text-muted">
                        <Link href={`/admin/orders/${c.id}`} className="hover:text-accent">
                          {c.reference.slice(0, 14)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div>{c.buyerName}</div>
                        <div className="text-xs text-muted">{c.buyerEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-muted">{tierName}</td>
                      <td className="px-4 py-3">{qty}</td>
                      <td className="px-4 py-3 text-xs text-muted max-w-xs truncate">
                        {c.compNote ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={c.status === 'PAID' ? 'accent' : 'muted'}>{c.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {formatEventDateTime(c.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
