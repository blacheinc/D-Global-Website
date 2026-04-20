import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, MessageCircle } from 'lucide-react';
import { db } from '@/server/db';
import { buildWaLink } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Booking request received',
  // Don't let confirmation pages bloat the sitemap or attract indexers -
  // the `code` query param is a one-off reference, not content.
  robots: { index: false, follow: false },
};

export default async function ArtistBookingConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await searchParams;
  if (!code || typeof code !== 'string') notFound();

  const booking = await db.artistBooking.findUnique({
    where: { code },
    select: {
      code: true,
      requesterName: true,
      eventDate: true,
      venueName: true,
      city: true,
      artist: { select: { stageName: true, slug: true } },
    },
  });
  if (!booking) notFound();

  const waHref = buildWaLink(
    `Hi D Global Entertainment, following up on my booking request for ${booking.artist.stageName}. Reference: ${booking.code.slice(0, 8).toUpperCase()}`,
  );

  return (
    <div className="container container-px py-20 md:py-28 max-w-xl">
      <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-accent/15 text-accent mb-6">
        <Check aria-hidden className="h-6 w-6" />
      </div>
      <p className="eyebrow">Booking request</p>
      <h1 className="mt-3 font-display text-display-lg text-balance">
        Request received, {booking.requesterName.split(' ')[0]}.
      </h1>
      <p className="mt-4 text-muted">
        We've got your booking request for{' '}
        <strong className="text-foreground">{booking.artist.stageName}</strong> at{' '}
        {booking.venueName}, {booking.city}. A label coordinator will reply within 24 hours with
        availability and a quote.
      </p>

      <dl className="mt-10 rounded-2xl border border-white/10 bg-surface p-6 space-y-4">
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Reference</dt>
          <dd className="mt-1 font-mono text-sm">{booking.code.slice(0, 8).toUpperCase()}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.18em] text-muted">Show date</dt>
          <dd className="mt-1 text-sm">
            {new Intl.DateTimeFormat('en-GB', {
              dateStyle: 'full',
              timeStyle: 'short',
              timeZone: 'Africa/Accra',
            }).format(booking.eventDate)}
          </dd>
        </div>
      </dl>

      <div className="mt-10 flex flex-col sm:flex-row gap-3">
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-full bg-accent text-white font-medium hover:bg-accent-hot"
        >
          <MessageCircle aria-hidden className="h-4 w-4" /> Message us on WhatsApp
        </a>
        <Link
          href={`/artists/${booking.artist.slug}`}
          className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 font-medium"
        >
          Back to {booking.artist.stageName}
        </Link>
      </div>
    </div>
  );
}
