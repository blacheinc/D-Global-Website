import QRCode from 'qrcode';
import { db } from '@/server/db';
import { verifyTicket } from '@/server/qr/signPayload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  const url = new URL(req.url);
  const itemId = url.searchParams.get('item');
  const token = url.searchParams.get('t');

  if (!itemId || !token) {
    return new Response('Missing parameters', { status: 400 });
  }

  const payload = verifyTicket(token);
  if (!payload || payload.orderId !== orderId || payload.orderItemId !== itemId) {
    return new Response('Invalid token', { status: 403 });
  }

  const item = await db.orderItem.findUnique({
    where: { id: itemId },
    include: { order: true },
  });
  if (!item || item.order.status !== 'PAID') {
    return new Response('Not authorized', { status: 403 });
  }

  let png: Buffer;
  try {
    png = await QRCode.toBuffer(token, {
      errorCorrectionLevel: 'M',
      margin: 1,
      scale: 8,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  } catch (err) {
    console.error('[qr] encode failed:', err);
    return new Response('QR generation failed', { status: 500 });
  }

  // Buffer extends Uint8Array, so it's a valid Response BodyInit on Node.
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
}
