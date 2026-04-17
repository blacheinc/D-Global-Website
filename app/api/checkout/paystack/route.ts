import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import { env } from '@/lib/env';
import { initializeTransaction } from '@/server/paystack/client';
import { checkoutSchema } from '@/features/tickets/schema';

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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { eventId, items, buyer } = parsed.data;

  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      ticketTypes: { where: { id: { in: items.map((i) => i.ticketTypeId) } } },
    },
  });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  let totalMinor = 0;
  const lineItems = items.map((it) => {
    const tt = event.ticketTypes.find((t) => t.id === it.ticketTypeId);
    if (!tt) throw new Error(`Ticket type ${it.ticketTypeId} not on this event`);
    if (tt.quota - tt.sold < it.quantity) {
      throw new Error(`Not enough ${tt.name} tickets remaining`);
    }
    totalMinor += tt.priceMinor * it.quantity;
    return { ticketTypeId: tt.id, quantity: it.quantity, unitPriceMinor: tt.priceMinor };
  });

  const reference = `dg_${randomUUID().replace(/-/g, '')}`;

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

  const callback = `${env.NEXT_PUBLIC_SITE_URL}/tickets/${order.id}?ref=${reference}`;

  try {
    const res = await initializeTransaction({
      email: buyer.email,
      amountMinor: totalMinor,
      reference,
      callbackUrl: callback,
      metadata: { orderId: order.id, eventId: event.id },
    });
    return NextResponse.json({
      authorization_url: res.data.authorization_url,
      orderId: order.id,
      reference,
    });
  } catch (err) {
    await db.order.update({
      where: { id: order.id },
      data: { status: 'FAILED' },
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Paystack initialize failed' },
      { status: 502 },
    );
  }
}
