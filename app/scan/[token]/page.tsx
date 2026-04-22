import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/server/db';
import { formatEventDateTime } from '@/lib/formatDate';
import { Scanner } from '@/features/scan/components/Scanner';

// Public (but token-gated) scanner page. Lives OUTSIDE the (site)
// route group so door staff don't see the public nav / footer / sticky
// WhatsApp bar while scanning — the page renders on whatever is
// provided by the root layout (minimal html/body/fonts).
//
// Token validity is checked up front on the server: unknown / revoked
// / expired tokens short-circuit to notFound() so a stale WhatsApp
// link can't render a scanner UI that'd then fail every POST.

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Ticket scanner',
  robots: { index: false, follow: false },
};

export default async function ScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await db.eventScanToken.findUnique({
    where: { token },
    include: {
      event: { select: { title: true, startsAt: true, venueName: true } },
    },
  });
  if (!session) notFound();
  const expired = session.expiresAt ? session.expiresAt.getTime() < Date.now() : false;
  const revoked = !!session.revokedAt;

  if (revoked || expired) {
    return (
      <div className="min-h-screen bg-background text-foreground grid place-items-center px-6 py-10">
        <div className="max-w-md text-center space-y-3">
          <p className="eyebrow">Scanner link</p>
          <h1 className="font-display text-3xl">
            {revoked ? 'This link has been revoked.' : 'This link has expired.'}
          </h1>
          <p className="text-sm text-muted">
            Ask whoever shared the link to generate a new one from the admin dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-lg px-4 py-6 md:py-10 space-y-6">
        <header>
          <p className="eyebrow">Door scanner</p>
          <h1 className="mt-2 font-display text-3xl leading-tight">{session.event.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {formatEventDateTime(session.event.startsAt)} · {session.event.venueName}
            {session.label ? ` · ${session.label}` : ''}
          </p>
        </header>

        <Scanner token={token} eventTitle={session.event.title} />
      </div>
    </div>
  );
}
