import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { db } from '@/server/db';
import { verifyPaystackSignature } from '@/server/paystack/verifyWebhook';
import { signTicket } from '@/server/qr/signPayload';
import { sendOrderConfirmation } from '@/server/email/orderConfirmation';
import { buildTicketPdf } from '@/server/tickets/ticketPdf';
import { captureError } from '@/server/observability';

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
  // try/finally wraps the handler so any Sentry captures inside (the
  // amount-mismatch fraud signal, the email-fail capture, or any future
  // capture) flush before the response returns. On serverless (Vercel)
  // the function may freeze the instant we return, dropping in-flight
  // Sentry sends. Sentry.flush is a no-op when the queue is empty, so
  // success-path requests pay no latency.
  try {
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
        // Mark the order failed for ops review, but ACK the webhook with 200.
        // Returning a non-2xx here would trigger Paystack's exponential-backoff
        // retry loop, and every retry would re-detect the same mismatch, a
        // retry storm. The mismatch is captured in paystackPayload for ops.
        await db.order.update({
          where: { id: order.id },
          data: { status: 'FAILED', paystackPayload: payload as unknown as object },
        });
        // Surface to Sentry as a real event (not just an error log). An
        // amount mismatch on a verified webhook means either a bug in
        // re-pricing or a tampering attempt, both warrant a page-able alert.
        // `reference` is a per-order identifier and goes in extra; the only
        // tag is the categorical `kind` so dashboards can filter on it.
        Sentry.captureMessage('[paystack webhook] amount mismatch', {
          level: 'error',
          tags: { kind: 'paystack-amount-mismatch' },
          extra: {
            reference: payload.data.reference,
            expected: order.totalMinor,
            received: payload.data.amount,
          },
        });
        return NextResponse.json({ ok: true, ignored: 'amount mismatch' });
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

      // Confirmation email is best-effort, the order is already PAID and
      // the user can always reach their tickets via /tickets/[orderId]. A
      // mail-provider outage shouldn't bounce the webhook into a retry
      // (Paystack would re-fire and we'd attempt to mail twice).
      //
      // PDF attachment: regenerate inside try/catch and pass as
      // attachment so the buyer lands with a scannable QR in their
      // inbox. If PDF rendering fails (hero fetch, pdfkit) we still
      // send the HTML email — the "View your QR tickets" CTA resolves
      // the same thing, we just prefer the attachment because it's
      // cache-friendly and works offline at the door.
      try {
        const fresh = await db.order.findUniqueOrThrow({
          where: { id: order.id },
          include: { event: true, items: { include: { ticketType: true } } },
        });
        const pdf = await buildTicketPdf(fresh.id).catch((err) => {
          captureError('[paystack webhook] ticket PDF build failed', err, {
            orderId: fresh.id,
            reference: payload.data.reference,
          });
          return null;
        });
        await sendOrderConfirmation({
          to: fresh.buyerEmail,
          buyerName: fresh.buyerName,
          orderId: fresh.id,
          reference: fresh.reference,
          totalMinor: fresh.totalMinor,
          currency: fresh.currency,
          eventTitle: fresh.event.title,
          eventStartsAt: fresh.event.startsAt,
          venueName: fresh.event.venueName,
          items: fresh.items.map((i) => ({
            name: i.ticketType.name,
            quantity: i.quantity,
            unitPriceMinor: i.unitPriceMinor,
          })),
          attachments: pdf
            ? [{ filename: pdf.filename, content: pdf.buffer, contentType: 'application/pdf' }]
            : undefined,
        });
      } catch (err) {
        captureError('[paystack webhook] order confirmation email failed', err, {
          orderId: order.id,
          reference: payload.data.reference,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } finally {
    await Sentry.flush(2000);
  }
}
