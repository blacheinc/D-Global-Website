'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Mounted on the ticket page while order.status === 'PENDING'. Two
// responsibilities, both time-boxed:
//
//   1. Actively ask Paystack via POST /api/tickets/:orderId/verify.
//      That endpoint hits Paystack's /transaction/verify and, if the
//      charge succeeded, flips Order.status → PAID with the same
//      transaction the webhook would have fired. This is the backstop
//      for a webhook that's slow, misrouted, or not configured at all.
//   2. Call router.refresh() so the server component re-reads the DB
//      and renders QR codes instead of the pending banner.
//
// Cadence: 3s on first tick (most payments confirm almost instantly),
// then 5s. Hard stop at 24 ticks (~2 minutes). If the order still
// hasn't paid by then, the copy on the page directs the buyer to
// follow up on WhatsApp; polling further just burns Paystack quota.

const FIRST_TICK_DELAY_MS = 3000;
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 24;

export function PendingStatusPoller({
  orderId,
  reference,
}: {
  orderId: string;
  reference: string;
}) {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    let count = 0;

    async function check() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/tickets/${orderId}/verify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // The server requires the reference as a capability token so
          // nobody can force a Paystack verify round-trip by enumerating
          // order IDs. The page only renders this component after the
          // reference check has already passed, so we can safely forward it.
          body: JSON.stringify({ reference }),
          // Don't cache the verify response; each tick should reflect
          // whatever Paystack + our DB agree on right now.
          cache: 'no-store',
        });
        if (!cancelled && res.ok) {
          // Status may have flipped to PAID inside the endpoint, pull
          // fresh server state so the page re-renders with QR codes.
          router.refresh();
        }
      } catch {
        // Network blip / transient 5xx. The next tick will retry.
      }
    }

    const first = setTimeout(check, FIRST_TICK_DELAY_MS);
    const interval = setInterval(() => {
      count += 1;
      if (count >= MAX_POLLS) {
        clearInterval(interval);
        return;
      }
      check();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [orderId, reference, router]);

  return null;
}
