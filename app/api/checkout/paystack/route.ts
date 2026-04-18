import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import { env } from '@/lib/env';
import { initializeTransaction } from '@/server/paystack/client';
import { checkoutSchema } from '@/features/tickets/schema';
import { captureError } from '@/server/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (env.PAYSTACK_MODE !== 'api') {
    return NextResponse.json(
      { error: 'API checkout is disabled. Set PAYSTACK_MODE=api and configure secret key.' },
      { status: 400 },
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

  // Re-price server-side from DB and validate availability per item. Use a
  // for-loop with early returns rather than throwing inside .map() — throwing
  // would surface as an uncaught 500, but these are user-correctable input
  // errors that deserve a 400/409 with a helpful message.
  let totalMinor = 0;
  const lineItems: Array<{ ticketTypeId: string; quantity: number; unitPriceMinor: number }> = [];
  for (const it of items) {
    const tt = event.ticketTypes.find((t) => t.id === it.ticketTypeId);
    if (!tt) {
      return NextResponse.json(
        { error: `Selected ticket type isn't available for this event.` },
        { status: 400 },
      );
    }
    if (tt.quota - tt.sold < it.quantity) {
      return NextResponse.json(
        { error: `Only ${Math.max(0, tt.quota - tt.sold)} ${tt.name} tickets left.` },
        { status: 409 },
      );
    }
    totalMinor += tt.priceMinor * it.quantity;
    lineItems.push({ ticketTypeId: tt.id, quantity: it.quantity, unitPriceMinor: tt.priceMinor });
  }

  const reference = `dg_${randomUUID().replace(/-/g, '')}`;

  let orderId: string;
  try {
    const order = await db.order.create({
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
    orderId = order.id;
  } catch (err) {
    captureError('[checkout] order create failed', err, { reference, eventId: event.id });
    return NextResponse.json(
      { error: 'Could not create your order. Try again in a moment.' },
      { status: 500 },
    );
  }

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
