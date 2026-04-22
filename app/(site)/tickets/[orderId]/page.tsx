import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { db } from '@/server/db';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatEventDateTime } from '@/lib/formatDate';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { PendingStatusPoller } from '@/features/tickets/components/PendingStatusPoller';

export const dynamic = 'force-dynamic';

export default async function TicketPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      event: true,
      items: { include: { ticketType: true } },
    },
  });
  if (!order) notFound();

  const isPending = order.status === 'PENDING';

  return (
    <section className="container-px py-14 md:py-20">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Order {order.reference.slice(0, 10)}</p>
          <Badge tone={order.status === 'PAID' ? 'accent' : 'muted'}>{order.status}</Badge>
        </div>

        <h1 className="font-display text-display-lg">{order.event.title}</h1>
        <p className="text-muted">
          {formatEventDateTime(order.event.startsAt)} · {order.event.venueName}
        </p>

        {isPending && (
          <>
            {/* Actively verifies with Paystack + refreshes the page so
                the status flip lands without the user hitting reload.
                See component for cadence + cap. */}
            <PendingStatusPoller orderId={order.id} />
            <div className="rounded-2xl border border-accent/40 bg-accent/10 p-5 text-sm">
              Payment is being confirmed. This page will update automatically. If it doesn't within a
              minute, check your email or contact D Global Entertainment on WhatsApp with reference{' '}
              <span className="font-mono">{order.reference.slice(0, 10)}</span>.
            </div>
          </>
        )}

        <div className="space-y-4">
          {order.items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-surface p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-accent">
                    {item.ticketType.tier.replace('_', ' ')}
                  </p>
                  <p className="mt-1 font-display text-lg">
                    {item.ticketType.name} · ×{item.quantity}
                  </p>
                </div>
                <p className="font-medium">
                  {formatPriceMinor(item.unitPriceMinor * item.quantity)}
                </p>
              </div>

              {order.status === 'PAID' && item.qrToken && (
                <div className="mt-5 grid grid-cols-[auto_1fr] gap-5 items-center">
                  <div className="rounded-xl overflow-hidden bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/tickets/${order.id}/qr?item=${item.id}&t=${encodeURIComponent(item.qrToken)}`}
                      alt="Ticket QR"
                      width={160}
                      height={160}
                      className="block h-40 w-40"
                    />
                  </div>
                  <div className="text-xs text-muted leading-relaxed">
                    Present this QR at the door. Valid for one entry per ticket.
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          {order.status === 'PAID' && (
            <Button asChild variant="primary">
              {/* Plain <a> (not Next <Link>) because the server route
                  streams a PDF with Content-Disposition: attachment.
                  <Link> would try to client-navigate and miss the
                  download prompt. `download` attr is belt-and-braces;
                  the server header is the real lever. */}
              <a
                href={`/api/tickets/${order.id}/download`}
                download={`dglobal-${order.reference}.pdf`}
              >
                <Download aria-hidden className="h-4 w-4" /> Download ticket
              </a>
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link href={`/events/${order.event.slug}`}>Event details</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/events">More events</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
