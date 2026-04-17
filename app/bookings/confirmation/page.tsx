import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { db } from '@/server/db';
import { Button } from '@/components/ui/Button';
import { buildWaLink, buildBookingMessage } from '@/lib/whatsapp';
import { formatEventDateTime } from '@/lib/formatDate';

export const metadata: Metadata = {
  title: 'Booking received',
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  if (!code) notFound();

  const booking = await db.booking.findUnique({
    where: { code },
    include: { package: true, event: true },
  });
  if (!booking) notFound();

  const waHref = buildWaLink(
    buildBookingMessage({
      packageName: booking.package.name,
      partySize: booking.partySize,
      eventTitle: booking.event?.title ?? null,
      eventDate: booking.event ? formatEventDateTime(booking.event.startsAt) : null,
      guestName: booking.guestName,
      bookingCode: booking.code,
    }),
  );

  return (
    <section className="min-h-[70vh] container-px py-20 grid place-items-center">
      <div className="max-w-lg text-center space-y-6">
        <div className="inline-grid h-16 w-16 place-items-center rounded-full bg-accent/15 border border-accent/40 mx-auto">
          <span className="font-display text-xl">✓</span>
        </div>
        <div>
          <p className="eyebrow justify-center">Booking received</p>
          <h1 className="mt-4 font-display text-display-lg text-balance">You're on the list.</h1>
          <p className="mt-3 text-muted">
            Reference <span className="text-foreground font-mono">{booking.code.slice(0, 8).toUpperCase()}</span> ·
            {' '}
            {booking.package.name} for {booking.partySize} guests
            {booking.event && (
              <>
                {' '}· {booking.event.title} · {formatEventDateTime(booking.event.startsAt)}
              </>
            )}
          </p>
        </div>

        <p className="text-sm text-muted">
          Continue on WhatsApp to confirm arrival details, bottle selection, and the deposit.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="primary" size="lg">
            <a href={waHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4" /> Continue on WhatsApp
            </a>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/events">Browse events</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
