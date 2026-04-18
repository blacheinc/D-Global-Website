import 'server-only';
import { Resend } from 'resend';
import { env } from '@/lib/env';

// Resend client cached for the process lifetime. Without an API key we
// log to the console instead — useful in dev (you see the magic link)
// and safe in CI/preview environments where a real key would risk
// sending mail to real addresses from a half-configured stack.
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

export async function sendMail(args: SendMailArgs): Promise<void> {
  if (!resend) {
    console.info('[mailer:dev]', { to: args.to, subject: args.subject });
    console.info('[mailer:dev:html]\n' + args.html);
    return;
  }
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    replyTo: args.replyTo,
  });
  if (error) {
    throw new Error(`[mailer] send failed (${args.subject}): ${error.message}`);
  }
}
