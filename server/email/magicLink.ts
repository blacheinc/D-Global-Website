import 'server-only';
import { sendMail } from '@/server/mailer';
import { emailLayout, escape } from './layout';
import { brand } from '@/lib/brand';
import { site } from '@/lib/site';

// Sent by NextAuth's Email provider (custom sendVerificationRequest below
// in lib/auth.ts wires this in). The link is single-use and expires after
// 10 minutes — we lean on Auth.js's built-in token table for that.

export async function sendMagicLink(args: { to: string; url: string }): Promise<void> {
  const host = new URL(args.url).host;
  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:${brand.accent};">Sign in</p>
    <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.2;font-weight:600;color:${brand.fg};">
      Tap below to sign in to ${escape(site.name)}.
    </h1>
    <p style="margin:0 0 24px 0;color:${brand.muted};">
      The link works once and expires soon. If you didn't request this, you can ignore the email.
    </p>
    <p style="margin:0 0 24px 0;">
      <a href="${escape(args.url)}" style="display:inline-block;background:${brand.accent};color:${brand.fg};text-decoration:none;padding:14px 28px;border-radius:9999px;font-weight:500;">
        Sign in to ${escape(host)}
      </a>
    </p>
    <p style="margin:0;color:${brand.muted};font-size:12px;word-break:break-all;">
      Or copy this URL: ${escape(args.url)}
    </p>`;
  await sendMail({
    to: args.to,
    subject: `Sign in to ${site.name}`,
    html: emailLayout({ preheader: `Sign in to ${site.name}`, bodyHtml }),
    text: `Sign in to ${site.name}: ${args.url}\n\nThe link works once and expires soon.`,
  });
}
