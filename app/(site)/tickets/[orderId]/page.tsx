import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Download } from 'lucide-react';
import { db } from '@/server/db';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatEventDateTime } from '@/lib/formatDate';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { ticketRefMatches } from '@/lib/ticketAccess';
import { PendingStatusPoller } from '@/features/tickets/components/PendingStatusPoller';

export const dynamic = 'force-dynamic';

// Keep ticket pages out of Google / Bing / Archive indexes even if a link
// leaks. The page also demands ?ref= on every view, but belt-and-braces.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orderId } = await params;
  const sp = await searchParams;
  const providedRef = typeof sp.ref === 'string' ? sp.ref : null;

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      event: true,
      items: { include: { ticketType: true } },
    },
  });
  if (!order) notFound();

  // Gate: the orderId alone isn't enough to see tickets. The `reference`
  // is the capability token, it lives in the success email + Paystack
  // callback URL. Without a matching ref we render a lookup form instead
  // of the QR codes / PDF button. Constant-time compare prevents byte-
  // level timing disclosure of the expected reference.
  const unlocked = ticketRefMatches(order.reference, providedRef);
  if (!unlocked) {
    return (
      <section className="container-px py-14 md:py-20">
        <div className="max-w-lg mx-auto space-y-6">
          <p className="eyebrow">Verify your order</p>
          <h1 className="font-display text-display-md">Enter your order reference</h1>
          <p className="text-sm text-muted">
            Your reference was sent in your confirmation email. It starts with{' '}
            <span className="font-mono">dg_</span> (paid orders) or{' '}
            <span className="font-mono">dgcomp_</span> (complimentary tickets).
          </p>
          <form method="get" className="space-y-4">
            <label className="block">
              <span className="text-xs uppercase tracking-[0.22em] text-muted">Reference</span>
              <input
                name="ref"
                required
                autoComplete="off"
                spellCheck={false}
                placeholder="dg_…"
                defaultValue={providedRef ?? ''}
                className="mt-2 w-full rounded-xl border border-white/10 bg-surface px-4 py-3 font-mono text-sm outline-none focus:border-accent"
              />
            </label>
            {providedRef && (
              <p className="text-xs text-accent">
                That reference doesn't match this order. Check your email for the confirmation.
              </p>
            )}
            <Button type="submit" variant="primary">
              Show my tickets
            </Button>
          </form>
          <p className="text-xs text-muted">
            Can't find it? Message D Global Entertainment on WhatsApp with your name and event.
          </p>
        </div>
      </section>
    );
  }

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
            <PendingStatusPoller orderId={order.id} reference={order.reference} />
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
                href={`/api/tickets/${order.id}/download?ref=${encodeURIComponent(order.reference)}`}
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
