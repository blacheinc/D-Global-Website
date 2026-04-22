// Pragmatic email validator — stricter than Zod's built-in .email()
// and closer to what gateway-side validators (Paystack, Stripe,
// Resend) actually accept. Rejects the common causes of Paystack's
// "Invalid Email Address Passed" response: short TLDs, missing TLD,
// whitespace anywhere, consecutive dots, bad leading/trailing dots,
// and the handful of unicode characters copy-paste out of iOS Mail.
//
// Not RFC 5322 compliant (neither is Paystack). The goal is: if this
// returns true, Paystack will almost certainly accept it; if it
// returns false, surface a field-level error and skip the API call.

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;

export function isStrictEmail(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  const value = raw.trim();
  if (value.length === 0 || value.length > 254) return false;
  // Must be plain ASCII — Paystack rejects unicode addresses and
  // smart-quote leakage from iOS Mail copy-paste.
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7F]/.test(value)) return false;
  // Whitespace anywhere kills it even if the regex would otherwise pass.
  if (/\s/.test(value)) return false;
  // Consecutive dots or dots at the boundaries of local / domain.
  if (value.includes('..')) return false;
  const [local, domain] = value.split('@');
  if (!local || !domain) return false;
  if (local.startsWith('.') || local.endsWith('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.startsWith('-') || domain.endsWith('-')) {
    return false;
  }
  return EMAIL_RE.test(value);
}

// Returns the canonical form the app should store / send upstream.
// Paired with isStrictEmail so callers can normalise + validate in one
// pass: if isStrictEmail(normaliseEmail(x)) is true, that's the value
// to persist.
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
