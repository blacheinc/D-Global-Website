import { db } from '@/server/db';
import { ticketRefMatches } from '@/lib/ticketAccess';
import { buildTicketPdf } from '@/server/tickets/ticketPdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One-click ticket PDF download. The ticket page's "Download ticket"
// button hits this endpoint; the browser receives a Content-Disposition
// attachment and saves the file — no print dialog.
//
// Access gate: the orderId is URL-visible (Paystack redirect, email,
// history) and not secret. The reference (128-bit randomUUID) is the
// capability token, so both are required here. Constant-time compare,
// and 404 on mismatch so the route can't be used to enumerate order IDs.
//
// PDF layout lives in server/tickets/ticketPdf.ts so the email
// attachment and this download use the same bytes.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  const url = new URL(req.url);
  const providedRef = url.searchParams.get('ref');

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { reference: true, status: true },
  });
  if (!order || !ticketRefMatches(order.reference, providedRef)) {
    return new Response('Not found', { status: 404 });
  }
  if (order.status !== 'PAID') {
    return new Response('Order not paid yet', { status: 400 });
  }

  const pdf = await buildTicketPdf(orderId);
  if (!pdf) return new Response('Ticket unavailable', { status: 404 });

  return new Response(pdf.buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': String(pdf.buffer.length),
    },
  });
}
