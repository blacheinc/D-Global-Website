import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OrderStatus } from '@prisma/client';
import { db } from '@/server/db';
import { Badge } from '@/components/ui/Badge';
import { formatEventDateTime } from '@/lib/formatDate';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { StatusSelect } from '@/features/admin/components/StatusSelect';
import { ResendTicketButton } from '@/features/admin/components/ResendTicketButton';
import { RecheckPaymentButton } from '@/features/admin/components/RecheckPaymentButton';
import { updateOrderStatus } from '@/features/admin/orderActions';

export const dynamic = 'force-dynamic';

const STATUSES = Object.values(OrderStatus);

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      event: { select: { title: true, slug: true } },
      items: { include: { ticketType: true } },
    },
  });
  if (!order) notFound();

  const boundAction = updateOrderStatus.bind(null, id);

  return (
    <div>
      <header className="mb-8">
        <Link
          href="/admin/orders"
          className="text-xs uppercase tracking-[0.18em] text-muted hover:text-foreground"
        >
          ← All orders
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {formatPriceMinor(order.totalMinor, order.currency)}
        </h1>
        <p className="mt-2 text-sm text-muted">
          <span className="font-mono text-xs">{order.reference}</span> ·{' '}
          {formatEventDateTime(order.createdAt)} · <Badge>{order.status}</Badge>
        </p>
      </header>

      <dl className="grid gap-6 sm:grid-cols-2 max-w-2xl">
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Buyer</dt>
          <dd className="mt-1">{order.buyerName}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Email</dt>
          <dd className="mt-1">{order.buyerEmail}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Phone</dt>
          <dd className="mt-1">{order.buyerPhone ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Paid at</dt>
          <dd className="mt-1">
            {order.paidAt ? formatEventDateTime(order.paidAt) : '-'}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Event</dt>
          <dd className="mt-1">
            <Link href={`/events/${order.event.slug}`} className="hover:text-accent">
              {order.event.title}
            </Link>
          </dd>
        </div>
      </dl>

      <section className="mt-12 border-t border-white/10 pt-10">
        <h2 className="mb-4 text-lg font-semibold">Line items</h2>
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Tier</th>
                <th scope="col" className="px-4 py-3 font-medium">Qty</th>
                <th scope="col" className="px-4 py-3 font-medium">Unit</th>
                <th scope="col" className="px-4 py-3 font-medium">Subtotal</th>
                <th scope="col" className="px-4 py-3 font-medium">Scanned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {order.items.map((item) => (
                <tr key={item.id} className="bg-bg/50">
                  <td className="px-4 py-3">{item.ticketType.name}</td>
                  <td className="px-4 py-3">{item.quantity}</td>
                  <td className="px-4 py-3 text-muted">
                    {formatPriceMinor(item.unitPriceMinor, order.currency)}
                  </td>
                  <td className="px-4 py-3">
                    {formatPriceMinor(item.unitPriceMinor * item.quantity, order.currency)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {item.scannedAt ? formatEventDateTime(item.scannedAt) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {order.status === 'PENDING' && (
        <section className="mt-12 border-t border-white/10 pt-10 max-w-2xl">
          <h2 className="mb-4 text-lg font-semibold">Recheck payment</h2>
          <p className="mb-4 text-xs text-muted">
            Asks Paystack directly whether reference{' '}
            <span className="font-mono">{order.reference.slice(0, 14)}</span> has been paid. If it has,
            the order flips to PAID, QR tickets are issued, and the buyer gets the confirmation
            email with the PDF attached. Safe to click repeatedly — it's a no-op once the order
            is PAID.
          </p>
          <RecheckPaymentButton orderId={order.id} />
        </section>
      )}

      <section className="mt-12 border-t border-white/10 pt-10 max-w-2xl">
        <h2 className="mb-4 text-lg font-semibold">Update status</h2>
        <StatusSelect current={order.status} options={STATUSES} action={boundAction} />
        <p className="mt-2 text-xs text-muted">
          PAID → PENDING is blocked server-side to keep the sold-ticket counter consistent.
        </p>
      </section>

      <section className="mt-12 border-t border-white/10 pt-10 max-w-2xl">
        <h2 className="mb-4 text-lg font-semibold">Resend tickets</h2>
        <p className="mb-4 text-xs text-muted">
          Fires the original confirmation email to {order.buyerEmail} with the ticket PDF attached.
          Only available once the order is PAID — the QR codes are generated at payment time.
        </p>
        <ResendTicketButton
          orderId={order.id}
          buyerEmail={order.buyerEmail}
          disabled={order.status !== 'PAID'}
        />
      </section>
    </div>
  );
}
