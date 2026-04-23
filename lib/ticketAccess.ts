import 'server-only';
import { timingSafeEqual } from 'node:crypto';

// Ticket access gate. The `orderId` in /tickets/[orderId] is a cuid that
// appears in URLs (Paystack redirect, email link, browser history) and is
// therefore not secret. The `reference` we set at checkout (dg_<32 hex>,
// 128 bits of entropy from randomUUID) is the capability token — it's
// printed only in the success email and the callback URL. Pairing the two
// before rendering QR codes, the PDF, or calling the Paystack verify
// backstop means an attacker who learns just the ID can't pull tickets.
//
// Comparison is constant-time so a timing side-channel can't leak bytes
// of the expected reference. Unequal lengths short-circuit false (safe —
// the length isn't itself a secret).

export function ticketRefMatches(expected: string, provided: string | null | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
