import 'server-only';
import { z } from 'zod';
import { Resend } from 'resend';
import { env } from '@/lib/env';

// Resend client cached for the process lifetime. In production, env.ts's
// refinement requires RESEND_API_KEY — so this branch only evaluates to
// null in dev, where we fall back to logging the email (useful for
// reading magic-link URLs off the console without an SMTP setup).
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export type SendMailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  // ReplyTo is useful for support flows where the user might hit reply
  // expecting a human; defaults to the from address otherwise.
  replyTo?: string;
};

const emailSchema = z.string().email();

// Strip CR/LF from anything that becomes an email header value. Our current
// callers all pass trusted or already-validated strings, but sendMail is a
// public boundary — a future caller could pass user-controlled data. An
// eventTitle like "Night Out\r\nBcc: attacker@evil.com" is the classic SMTP
// header-injection vector. Resend's API probably sanitizes, but "probably"
// isn't a security posture; belt-and-suspenders.
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export async function sendMail(args: SendMailArgs): Promise<void> {
  const to = sanitizeHeader(args.to);
  const subject = sanitizeHeader(args.subject);
  const replyTo = args.replyTo ? sanitizeHeader(args.replyTo) : undefined;

  // Validate the recipient looks like an email. Resend rejects malformed
  // addresses at their API, but catching here gives a clearer error and
  // avoids a round-trip for obvious garbage.
  const parsed = emailSchema.safeParse(to);
  if (!parsed.success) {
    throw new Error(`[mailer] invalid recipient email: ${to}`);
  }

  if (!resend) {
    // Dev-only path. env.ts's production refinement requires
    // RESEND_API_KEY so this branch can't execute in a production build
    // without the boot already having failed. Print the email so
    // operators can pick up magic links without running an SMTP server.
    console.info('[mailer:dev]', { to, subject });
    console.info('[mailer:dev:html]\n' + args.html);
    return;
  }
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html: args.html,
    text: args.text,
    replyTo,
  });
  if (error) {
    throw new Error(`[mailer] send failed (${subject}): ${error.message}`);
  }
}
