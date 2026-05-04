import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { Resend } from 'resend';
import { env } from '@/lib/env';

// Error thrown when Resend's API is the problem, not us. Callers can
// branch on this to show "mail provider is down, try again in a few
// minutes" instead of a generic "could not send email" that reads
// like a bug in our code.
export class MailProviderUnavailableError extends Error {
  readonly providerName = 'resend';
  constructor(message: string) {
    super(message);
    this.name = 'MailProviderUnavailableError';
  }
}

// Resend client cached for the process lifetime. In production, env.ts's
// refinement requires RESEND_API_KEY, so this branch only evaluates to
// null in dev, where we fall back to logging the email (useful for
// reading magic-link URLs off the console without an SMTP setup).
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export type MailAttachment = {
  filename: string;
  content: Buffer;
  // contentType is optional, Resend infers from the extension when
  // absent, but we set it explicitly for ticket PDFs so inline previews
  // work in Gmail / Apple Mail.
  contentType?: string;
};

export type SendMailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  // ReplyTo is useful for support flows where the user might hit reply
  // expecting a human; defaults to the from address otherwise.
  replyTo?: string;
  attachments?: ReadonlyArray<MailAttachment>;
};

const emailSchema = z.string().email();

// Strip CR/LF from anything that becomes an email header value. Our current
// callers all pass trusted or already-validated strings, but sendMail is a
// public boundary, a future caller could pass user-controlled data. An
// eventTitle like "Night Out\r\nBcc: attacker@evil.com" is the classic SMTP
// header-injection vector. Resend's API probably sanitizes, but "probably"
// isn't a security posture; belt-and-suspenders.
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

// Resend's API occasionally returns 5xx under load ("Internal server
// error. We are unable to process your request right now, please try
// again later.") and sometimes chokes on specific attachment payloads.
// Neither is deterministic, the same request will usually succeed on
// a second attempt. Classify based on the error message so we only
// retry transient failures, not validation errors (bad email, attachment
// too large, etc.) that will fail the same way every time.
function isTransientResendError(err: { name?: string; message?: string }): boolean {
  const text = `${err.name ?? ''} ${err.message ?? ''}`.toLowerCase();
  return (
    text.includes('internal server error') ||
    text.includes('try again later') ||
    text.includes('temporarily unavailable') ||
    text.includes('rate limit') ||
    text.includes('timeout') ||
    text.includes('network')
  );
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
    const attachmentSummary = args.attachments?.length
      ? ` (${args.attachments.length} attachment${args.attachments.length === 1 ? '' : 's'})`
      : '';
    console.info('[mailer:dev]', { to, subject: subject + attachmentSummary });
    console.info('[mailer:dev:html]\n' + args.html);
    return;
  }

  // Resend's SDK accepts Node Buffer for attachment content on the
  // server. We pass the filename through sanitizeHeader, not because it
  // ends up in an RFC 2822 header (the SDK base64-encodes the body),
  // but to strip anything that would confuse email clients' download
  // prompts (CRLF is the usual suspect). Ticket filenames are already
  // well-formed, this is the same belt-and-suspenders posture as subject.
  const attachments = args.attachments?.map((a) => ({
    filename: sanitizeHeader(a.filename),
    content: a.content,
    contentType: a.contentType,
  }));

  const payload = {
    from: env.EMAIL_FROM,
    to,
    subject,
    html: args.html,
    text: args.text,
    replyTo,
    attachments,
  };

  // Retry transient 5xx with exponential backoff. Three attempts (one
  // original + two retries) at 500ms/1500ms rides out ~2s Resend
  // wobbles, which is the majority of their hiccups. A sustained
  // outage longer than that will still surface, callers
  // (sendOrderConfirmation) can then decide whether to degrade.
  // Non-transient errors (bad email, payload too large, auth) fail
  // immediately since retrying them is pointless.
  const backoffs = [500, 1500];
  let lastError: { name?: string; message?: string } | null = null;
  let sawTransient = false;
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    const result = await resend.emails.send(payload);
    if (!result.error) return;
    lastError = result.error;
    if (!isTransientResendError(result.error)) break;
    sawTransient = true;
    if (attempt < backoffs.length) await sleep(backoffs[attempt]!);
  }

  const err = lastError!;
  // Tag Sentry on our own schedule so dashboards can slice Resend
  // noise apart from real application bugs. We capture here rather
  // than letting the throw propagate because every caller wraps us
  // in a try/catch, callers only see the Error message, not the
  // tags/extras we want on the event.
  Sentry.captureMessage(
    sawTransient ? '[mailer] resend upstream sustained outage' : '[mailer] resend rejected payload',
    {
      level: 'error',
      tags: { upstream: 'resend', kind: sawTransient ? 'transient' : 'validation' },
      extra: {
        subject,
        errorName: err.name ?? 'error',
        errorMessage: err.message ?? '',
        attempts: sawTransient ? backoffs.length + 1 : 1,
        hasAttachment: Boolean(attachments?.length),
      },
    },
  );

  if (sawTransient) {
    throw new MailProviderUnavailableError(
      `[mailer] resend unavailable after ${backoffs.length + 1} attempts (${subject}) [${err.name ?? 'error'}]: ${err.message}`,
    );
  }
  throw new Error(
    `[mailer] send failed (${subject}) [${err.name ?? 'error'}]: ${err.message}`,
  );
}
