import 'server-only';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { db } from '@/server/db';
import { signTicket } from '@/server/qr/signPayload';
import { captureError } from '@/server/observability';

// Single source of truth for the ticket PDF. Both the user-facing
// /api/tickets/[orderId]/download route and the confirmation email
// attachment invoke buildTicketPdf; keeping layout in one file means
// the PDF a buyer downloads looks identical to the PDF they received.
//
// Node runtime only, pdfkit uses Node streams + Buffer.

const BRAND = {
  bg: '#000000',
  surface: '#1A1A1A',
  accent: '#C00000',
  fg: '#FFFFFF',
  muted: '#B3B3B3',
} as const;

export type TicketPdfResult = {
  buffer: Buffer;
  filename: string;
};

export async function buildTicketPdf(orderId: string): Promise<TicketPdfResult | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      event: true,
      items: { include: { ticketType: true } },
    },
  });
  if (!order || order.status !== 'PAID') return null;

  // Defensive backfill: any PAID order whose line items don't have a
  // qrToken yet gets one signed now. The webhook + verify backstop +
  // reconcile path all sign at the moment they flip status; the only
  // way to land here without a token is a code path that flipped to
  // PAID without doing it (historically: admin status overrides
  // pre-fix). Without this, the PDF would render a blank QR slot for
  // those items and the buyer would have a useless ticket.
  const itemsMissingTokens = order.items.filter((it) => !it.qrToken);
  if (itemsMissingTokens.length > 0) {
    try {
      const signed = await db.$transaction(
        itemsMissingTokens.map((it) =>
          db.orderItem.update({
            where: { id: it.id },
            data: {
              qrToken: signTicket({
                orderItemId: it.id,
                orderId: order.id,
                eventId: order.eventId,
                issuedAt: Date.now(),
              }),
            },
            select: { id: true, qrToken: true },
          }),
        ),
      );
      // Mirror the freshly-signed tokens onto the in-memory items so
      // the rest of this function renders QRs for them without a
      // re-read round-trip.
      for (const s of signed) {
        const target = order.items.find((it) => it.id === s.id);
        if (target) target.qrToken = s.qrToken;
      }
    } catch (err) {
      captureError('[ticket-pdf] qr backfill failed', err, {
        orderId,
        missingCount: itemsMissingTokens.length,
      });
      // Fall through with whatever tokens we do have; the QR-encode
      // step below will skip null tokens. Better than throwing, the
      // PDF still has the buyer's reference + event details.
    }
  }

  // Fetch hero once, render one QR per line item (qrToken lives on the
  // line item, scanners validate by scan count, not serial).
  const [heroBuf, qrsByItem] = await Promise.all([
    fetchImageBuffer(order.event.heroImage).catch((err) => {
      captureError('[ticket-pdf] hero fetch failed', err, {
        orderId,
        heroImage: order.event.heroImage,
      });
      return null;
    }),
    Promise.all(
      order.items.map(async (it) => {
        if (!it.qrToken) return [it.id, null] as const;
        try {
          const buf = await QRCode.toBuffer(it.qrToken, {
            errorCorrectionLevel: 'M',
            margin: 1,
            scale: 10,
            color: { dark: '#000000', light: '#FFFFFF' },
          });
          return [it.id, buf] as const;
        } catch (err) {
          captureError('[ticket-pdf] QR encode failed', err, { orderId, itemId: it.id });
          return [it.id, null] as const;
        }
      }),
    ).then((pairs) => Object.fromEntries(pairs) as Record<string, Buffer | null>),
  ]);

  const units = order.items.flatMap((item) =>
    Array.from({ length: item.quantity }, (_, i) => ({
      item,
      indexInBatch: i + 1,
      batchSize: item.quantity,
    })),
  );

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    info: {
      Title: `${order.event.title} ticket`,
      Author: 'D Global Entertainment',
      Creator: 'dglobalentertainment.com',
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));

  units.forEach(({ item, indexInBatch, batchSize }, pageIdx) => {
    if (pageIdx > 0) doc.addPage({ size: 'A4', margin: 0 });
    drawTicketPage(doc, {
      heroBuf,
      qrBuf: qrsByItem[item.id] ?? null,
      eventTitle: order.event.title,
      eventDate: formatLongDate(order.event.startsAt),
      eventTime: formatTime(order.event.startsAt),
      doorsTime: order.event.doorsAt ? formatTime(order.event.doorsAt) : null,
      venueName: order.event.venueName,
      venueAddress: order.event.venueAddress,
      venueCity: order.event.venueCity,
      tierLabel: item.ticketType.tier.replace('_', ' '),
      tierName: item.ticketType.name,
      batchLabel: batchSize > 1 ? `${indexInBatch} of ${batchSize}` : null,
      holder: order.buyerName,
      reference: order.reference,
    });
  });

  doc.end();
  await done;
  const buffer = Buffer.concat(chunks);
  const filename = `dglobal-${order.reference}.pdf`;
  return { buffer, filename };
}

// ---- helpers ----

type TicketPageArgs = {
  heroBuf: Buffer | null;
  qrBuf: Buffer | null;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  doorsTime: string | null;
  venueName: string;
  venueAddress: string | null;
  venueCity: string;
  tierLabel: string;
  tierName: string;
  batchLabel: string | null;
  holder: string;
  reference: string;
};

function drawTicketPage(doc: PDFKit.PDFDocument, t: TicketPageArgs) {
  const W = doc.page.width;
  const H = doc.page.height;

  doc.rect(0, 0, W, H).fill(BRAND.bg);

  const heroH = Math.round(H * 0.38);
  if (t.heroBuf) {
    try {
      doc.image(t.heroBuf, 0, 0, { width: W, height: heroH, cover: [W, heroH] as never });
    } catch {
      doc.rect(0, 0, W, heroH).fill(BRAND.surface);
    }
  } else {
    doc.rect(0, 0, W, heroH).fill(BRAND.surface);
  }

  doc.rect(0, heroH - 120, W, 120).fill(BRAND.bg).fillOpacity(0.65);
  doc.fillOpacity(1);

  doc
    .fillColor(BRAND.accent)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('D GLOBAL ENTERTAINMENT', 40, heroH - 70, { characterSpacing: 3 });
  doc
    .fillColor(BRAND.fg)
    .font('Helvetica-Bold')
    .fontSize(24)
    .text(t.eventTitle, 40, heroH - 52, { width: W - 80, lineBreak: false, ellipsis: true });

  const bodyTop = heroH + 36;
  const leftX = 40;
  const leftW = Math.round(W * 0.55);
  const qrSize = 180;
  const qrX = W - qrSize - 40;
  const qrY = bodyTop;

  drawLabeledBlock(doc, 'DATE', t.eventDate, leftX, bodyTop, leftW);
  const doorsLine = t.doorsTime ? `Doors ${t.doorsTime} · Show ${t.eventTime}` : t.eventTime;
  doc
    .fillColor(BRAND.muted)
    .font('Helvetica')
    .fontSize(10)
    .text(doorsLine, leftX, doc.y + 2, { width: leftW });

  const venueY = doc.y + 16;
  drawLabeledBlock(doc, 'VENUE', t.venueName, leftX, venueY, leftW);
  if (t.venueAddress) {
    doc
      .fillColor(BRAND.muted)
      .font('Helvetica')
      .fontSize(10)
      .text(t.venueAddress, leftX, doc.y + 2, { width: leftW });
  }
  doc
    .fillColor(BRAND.muted)
    .font('Helvetica')
    .fontSize(10)
    .text(t.venueCity, leftX, doc.y + 2, { width: leftW });

  const tierY = doc.y + 20;
  drawLabeledBlock(doc, 'TIER', t.tierName, leftX, tierY, leftW);
  const tierSubtitle = t.batchLabel ? `${t.tierLabel} · ${t.batchLabel}` : t.tierLabel;
  doc
    .fillColor(BRAND.accent)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(tierSubtitle, leftX, doc.y + 2, { width: leftW, characterSpacing: 2 });

  const holderY = doc.y + 20;
  drawLabeledBlock(doc, 'HOLDER', t.holder, leftX, holderY, leftW);

  if (t.qrBuf) {
    const pad = 12;
    doc
      .roundedRect(qrX - pad, qrY - pad, qrSize + pad * 2, qrSize + pad * 2, 12)
      .fill(BRAND.fg);
    doc.image(t.qrBuf, qrX, qrY, { width: qrSize, height: qrSize });
  }
  doc
    .fillColor(BRAND.muted)
    .font('Courier')
    .fontSize(9)
    .text(t.reference.slice(0, 10).toUpperCase(), qrX, qrY + qrSize + 16, {
      width: qrSize,
      align: 'center',
    });

  const footerY = H - 50;
  doc
    .strokeColor('#2E2E2E')
    .lineWidth(1)
    .dash(2, { space: 4 })
    .moveTo(40, footerY - 16)
    .lineTo(W - 40, footerY - 16)
    .stroke()
    .undash();
  doc
    .fillColor(BRAND.muted)
    .font('Helvetica')
    .fontSize(8)
    .text('Present QR at the door. One entry per ticket.', 40, footerY, {
      characterSpacing: 2,
    });
  doc.text('dglobalentertainment.com', 40, footerY, {
    width: W - 80,
    align: 'right',
    characterSpacing: 2,
  });
}

function drawLabeledBlock(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
) {
  doc
    .fillColor(BRAND.muted)
    .font('Helvetica-Bold')
    .fontSize(7)
    .text(label, x, y, { width: w, characterSpacing: 2 });
  doc
    .fillColor(BRAND.fg)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(value, x, doc.y + 2, { width: w });
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Image fetch ${res.status}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

function formatLongDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Accra',
  }).format(d);
}

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Accra',
  }).format(d);
}
