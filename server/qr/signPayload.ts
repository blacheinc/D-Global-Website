import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

export type TicketPayload = {
  orderItemId: string;
  orderId: string;
  eventId: string;
  issuedAt: number;
};

function sign(payload: string): string {
  return createHmac('sha256', env.QR_SECRET).update(payload).digest('hex');
}

export function signTicket(payload: TicketPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = sign(body);
  return `${body}.${sig}`;
}

export function verifyTicket(token: string): TicketPayload | null {
  // Strict 2-part parse: signTicket only ever produces `body.sig`. Tokens
  // with extra dots (`body.sig.junk`) wouldn't be exploitable today (the
  // verified payload is still the legitimate body), but rejecting them keeps
  // the format invariant explicit and prevents subtle drift if the format
  // ever evolves.
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sig, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TicketPayload;
  } catch {
    return null;
  }
}
