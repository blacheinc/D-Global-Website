import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { db } from '@/server/db';
import { captureError } from '@/server/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One-click ticket PDF download. The page's "Download ticket" button
// hits this endpoint; the browser receives a Content-Disposition
// attachment and saves the file — no print dialog, no "Save as PDF"
// selection, just a PDF lands in Downloads.
//
// Layout: one page per physical attendee (so a qty-of-4 order
// produces a 4-page PDF), sized A4 portrait. Each page is designed
// around the event — hero image top band with a dark-to-transparent
// scrim, event title in the display weight, date/venue/tier block
// below, and a sharp QR centred for the scanner.
//
// Keep this in the Node runtime: pdfkit uses Node streams + Buffer.

const BRAND = {
  bg: '#000000',
  surface: '#1A1A1A',
  accent: '#C00000',
  fg: '#FFFFFF',
  muted: '#B3B3B3',
} as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      event: true,
      items: { include: { ticketType: true } },
    },
  });
  if (!order) return new Response('Order not found', { status: 404 });
  // Unpaid orders don't have qrTokens and shouldn't be printable.
  if (order.status !== 'PAID') return new Response('Order not paid yet', { status: 400 });

  // Fetch the event hero image once (same buffer reused on every ticket
  // page) and render QR codes once per distinct OrderItem (the qrToken
  // lives on the line item, not the unit, so a qty-of-4 line item
  // shares one QR across its 4 units — door scanners validate by scan
  // count, not ticket serial).
  const [heroBuf, qrsByItem] = await Promise.all([
    fetchImageBuffer(order.event.heroImage).catch((err) => {
      captureError('[ticket-download] hero fetch failed', err, {
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
          captureError('[ticket-download] QR encode failed', err, {
            orderId,
            itemId: it.id,
          });
          return [it.id, null] as const;
        }
      }),
    ).then((pairs) => Object.fromEntries(pairs) as Record<string, Buffer | null>),
  ]);

  // Expand line items into ticket units so qty > 1 yields one page per
  // attendee.
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

  // Collect the streamed output into a single Buffer; Next's Response
  // wants the body all-at-once (Node Response body doesn't pipe from a
  // pdfkit stream cleanly without extra plumbing).
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
  const pdf = Buffer.concat(chunks);

  const filename = `dglobal-${order.reference}.pdf`;
  return new Response(pdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': String(pdf.length),
    },
  });
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

  // Background fills the whole page so the printed PDF retains the
  // brand-dark ticket aesthetic rather than showing the paper's white
  // through any gap.
  doc.rect(0, 0, W, H).fill(BRAND.bg);

  // Hero band — top 38% of the page.
  const heroH = Math.round(H * 0.38);
  if (t.heroBuf) {
    try {
      doc.image(t.heroBuf, 0, 0, { width: W, height: heroH, cover: [W, heroH] as never });
    } catch {
      // pdfkit throws for unsupported formats (e.g. AVIF); fall back
      // to the solid surface so layout doesn't collapse.
      doc.rect(0, 0, W, heroH).fill(BRAND.surface);
    }
  } else {
    doc.rect(0, 0, W, heroH).fill(BRAND.surface);
  }

  // Dark scrim at the bottom of the hero band so the overlaid title
  // stays legible regardless of what's in the photo.
  doc.rect(0, heroH - 120, W, 120).fill(BRAND.bg).fillOpacity(0.65);
  doc.fillOpacity(1); // reset for subsequent draws

  // Eyebrow + title on top of the scrim.
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

  // Body content — two columns under the hero band.
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

  // QR panel — white card so camera scanners pick it up reliably no
  // matter how the PDF is printed / viewed.
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

  // Footer band — dashed rule, usage instruction, domain.
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
