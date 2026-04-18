import 'server-only';
import { sendMail } from '@/server/mailer';
import { emailLayout, escape } from './layout';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { formatEventDateTime } from '@/lib/formatDate';
import { env } from '@/lib/env';
import { brand } from '@/lib/brand';

export type OrderConfirmationArgs = {
  to: string;
  buyerName: string;
  orderId: string;
  reference: string;
  totalMinor: number;
  currency: string;
  eventTitle: string;
  eventStartsAt: Date;
  venueName: string;
  items: ReadonlyArray<{ name: string; quantity: number; unitPriceMinor: number }>;
};

export async function sendOrderConfirmation(args: OrderConfirmationArgs): Promise<void> {
  // Encode the order ID even though current cuids are [a-z0-9]+, if the
  // ID format ever changes (ULID with dashes, uuid) this keeps the href
  // valid without another code change.
  const ticketsUrl = `${env.NEXT_PUBLIC_SITE_URL}/tickets/${encodeURIComponent(args.orderId)}`;
  const firstName = args.buyerName.trim().split(/\s+/)[0] || 'Hey';
  const itemsHtml = args.items
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid ${brand.border};">
            <div style="color:${brand.fg};font-weight:500;">${escape(item.name)}</div>
            <div style="color:${brand.muted};font-size:13px;">Qty ${escape(item.quantity)}</div>
          </td>
          <td align="right" style="padding:12px 0;border-bottom:1px solid ${brand.border};color:${brand.fg};">
            ${escape(formatPriceMinor(item.unitPriceMinor * item.quantity, args.currency))}
          </td>
        </tr>`,
    )
    .join('');

  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:${brand.accent};">You're in</p>
    <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.2;font-weight:600;color:${brand.fg};">
      ${escape(firstName)}, your tickets are confirmed.
    </h1>
    <p style="margin:0 0 24px 0;color:${brand.muted};">
      ${escape(args.eventTitle)} · ${escape(formatEventDateTime(args.eventStartsAt))} · ${escape(args.venueName)}
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;">
      ${itemsHtml}
      <tr>
        <td style="padding:16px 0 0 0;color:${brand.muted};font-size:13px;">Total</td>
        <td align="right" style="padding:16px 0 0 0;color:${brand.fg};font-weight:600;font-size:18px;">
          ${escape(formatPriceMinor(args.totalMinor, args.currency))}
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px 0;">
      <a href="${escape(ticketsUrl)}" style="display:inline-block;background:${brand.accent};color:${brand.fg};text-decoration:none;padding:14px 28px;border-radius:9999px;font-weight:500;">
        View your QR tickets
      </a>
    </p>
    <p style="margin:0;color:${brand.muted};font-size:13px;">
      Order reference: <code style="font-family:Menlo,Monaco,Consolas,monospace;">${escape(args.reference)}</code>
    </p>`;

  const textBody = [
    `${args.eventTitle}, ${formatEventDateTime(args.eventStartsAt)} at ${args.venueName}`,
    '',
    ...args.items.map(
      (i) => `  ${i.quantity} × ${i.name}, ${formatPriceMinor(i.unitPriceMinor * i.quantity, args.currency)}`,
    ),
    '',
    `Total: ${formatPriceMinor(args.totalMinor, args.currency)}`,
    '',
    `View your tickets: ${ticketsUrl}`,
    `Order reference: ${args.reference}`,
  ].join('\n');

  await sendMail({
    to: args.to,
    subject: `You're in, ${args.eventTitle}`,
    html: emailLayout({
      preheader: `Your tickets to ${args.eventTitle} are confirmed.`,
      bodyHtml,
    }),
    text: textBody,
  });
}
