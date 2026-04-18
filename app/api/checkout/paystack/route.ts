import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import { env } from '@/lib/env';
import { initializeTransaction } from '@/server/paystack/client';
import { checkoutSchema } from '@/features/tickets/schema';
import { captureError } from '@/server/observability';
import { isSameOrigin, rateLimit } from '@/server/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// How long a PENDING order reserves capacity against a tier's quota.
// Paystack's redirect → Pay → webhook round-trip is usually seconds,
// occasionally minutes (bank 3DS flow); 30 minutes covers realistic
// completions while freeing abandoned carts fast enough that inventory
// stays honest during a drop.
const PENDING_TTL_MS = 30 * 60 * 1000;

export async function POST(req: Request) {
  if (env.PAYSTACK_MODE !== 'api') {
    return NextResponse.json(
      { error: 'API checkout is disabled. Set PAYSTACK_MODE=api and configure secret key.' },
      { status: 400 },
    );
  }

  // Same-origin gate: checkout creates an Order + hits Paystack; a
  // cross-origin POST from attacker.com isn't a legitimate flow, and
  // blocking one closes a low-effort spam vector. Rate limit on top:
  // 10 init attempts / 5 min / IP is enough for a human retrying a
  // bank-declined card without being so generous that a script can
  // flood pending orders and hold quota hostage (PENDING_TTL_MS is 30
  // minutes, so without a cap a scripted attacker could reserve the
  // whole inventory for half an hour at near-zero cost).
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 });
  }
  const rl = rateLimit(req, 'checkout', 10, 5 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many checkout attempts. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Please check your details and try again.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  const { eventId, items, buyer } = parsed.data;

  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      ticketTypes: { where: { id: { in: items.map((i) => i.ticketTypeId) } } },
    },
  });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const reference = `dg_${randomUUID().replace(/-/g, '')}`;

  // Re-price server-side from DB and validate availability per item.
  //
  // Historical bug: this used to check `quota - sold < qty` against the
  // event.ticketTypes we already had in memory, then db.order.create()
  // outside any transaction. Two failure modes:
  //   (a) `sold` only moves on the Paystack webhook, so N concurrent
  //       checkouts all read the same pre-payment value, all pass, all
  //       get redirected to Paystack. Enough of them pay and sold ends
  //       up > quota — a real oversell under drop-style load.
  //   (b) Even the pre-check could race with another order creating an
  //       item for the same tier, since order.create wasn't transactional.
  //
  // Fix: count pending-but-unpaid order items in the window against
  // quota too, and wrap the re-check + order.create in a $transaction
  // so they serialize within the request. A pending order holds
  // capacity for PENDING_TTL_MS — long enough for a Paystack redirect
  // + completion, short enough that an abandoned checkout frees
  // inventory quickly. Abandoned pending orders past TTL are ignored
  // here; the availability math already excludes them.
  type CheckoutOutcome =
    | { ok: true; orderId: string; totalMinor: number }
    | { ok: false; status: number; error: string };
  let outcome: CheckoutOutcome;
  try {
    outcome = await db.$transaction(async (tx) => {
      let totalMinor = 0;
      const lineItems: Array<{ ticketTypeId: string; quantity: number; unitPriceMinor: number }> =
        [];
      for (const it of items) {
        const tt = event.ticketTypes.find((t) => t.id === it.ticketTypeId);
        if (!tt) {
          return {
            ok: false as const,
            status: 400,
            error: "Selected ticket type isn't available for this event.",
          };
        }
        const pending = await tx.orderItem.aggregate({
          where: {
            ticketTypeId: tt.id,
            order: {
              status: 'PENDING',
              createdAt: { gt: new Date(Date.now() - PENDING_TTL_MS) },
            },
          },
          _sum: { quantity: true },
        });
        const reserved = pending._sum.quantity ?? 0;
        const available = tt.quota - tt.sold - reserved;
        if (available < it.quantity) {
          return {
            ok: false as const,
            status: 409,
            error: `Only ${Math.max(0, available)} ${tt.name} ticket${available === 1 ? '' : 's'} left.`,
          };
        }
        totalMinor += tt.priceMinor * it.quantity;
        lineItems.push({ ticketTypeId: tt.id, quantity: it.quantity, unitPriceMinor: tt.priceMinor });
      }
      const order = await tx.order.create({
        data: {
          reference,
          eventId: event.id,
          buyerName: buyer.name,
          buyerEmail: buyer.email,
          buyerPhone: buyer.phone,
          totalMinor,
          items: { create: lineItems },
        },
      });
      return { ok: true as const, orderId: order.id, totalMinor };
    });
  } catch (err) {
    captureError('[checkout] order create failed', err, { reference, eventId: event.id });
    return NextResponse.json(
      { error: 'Could not create your order. Try again in a moment.' },
      { status: 500 },
    );
  }
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }
  const { orderId, totalMinor } = outcome;

  const callback = `${env.NEXT_PUBLIC_SITE_URL}/tickets/${orderId}?ref=${reference}`;

  try {
    const res = await initializeTransaction({
      email: buyer.email,
      amountMinor: totalMinor,
      reference,
      callbackUrl: callback,
      metadata: { orderId, eventId: event.id },
    });
    return NextResponse.json({
      authorization_url: res.data.authorization_url,
      orderId,
      reference,
    });
  } catch (err) {
    // Best-effort: try to mark the order FAILED, but don't let a secondary
    // DB failure mask the original Paystack error in the response.
    try {
      await db.order.update({
        where: { id: orderId },
        data: { status: 'FAILED' },
      });
    } catch (updateErr) {
      captureError('[checkout] failed to mark order FAILED after init error', updateErr, {
        orderId,
        reference,
      });
    }
    captureError('[checkout] paystack initialize failed', err, { orderId, reference });
    return NextResponse.json(
      { error: 'Payment provider is unreachable. Try again or message us on WhatsApp.' },
      { status: 502 },
    );
  }
}
