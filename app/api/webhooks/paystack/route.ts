import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { verifyPaystackSignature } from '@/server/paystack/verifyWebhook';
import { signTicket } from '@/server/qr/signPayload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PaystackEvent = {
  event: string;
  data: {
    reference: string;
    amount: number;
    status?: string;
    customer?: { email?: string };
  };
};

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('x-paystack-signature');
  if (!verifyPaystackSignature(raw, sig)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: PaystackEvent;
  try {
    payload = JSON.parse(raw) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (payload.event === 'charge.success') {
    const order = await db.order.findUnique({
      where: { reference: payload.data.reference },
      include: { items: true },
    });
    if (!order) {
      return NextResponse.json({ ok: true, ignored: 'unknown reference' });
    }
    if (order.status === 'PAID') {
      return NextResponse.json({ ok: true, idempotent: true });
    }
    if (payload.data.amount !== order.totalMinor) {
      await db.order.update({
        where: { id: order.id },
        data: { status: 'FAILED', paystackPayload: payload as unknown as object },
      });
      return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
    }

    await db.$transaction([
      db.order.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paystackPayload: payload as unknown as object,
        },
      }),
      ...order.items.map((item) =>
        db.orderItem.update({
          where: { id: item.id },
          data: {
            qrToken: signTicket({
              orderItemId: item.id,
              orderId: order.id,
              eventId: order.eventId,
              issuedAt: Date.now(),
            }),
          },
        }),
      ),
      ...order.items.map((item) =>
        db.ticketType.update({
          where: { id: item.ticketTypeId },
          data: { sold: { increment: item.quantity } },
        }),
      ),
    ]);
  }

  return NextResponse.json({ ok: true });
}
