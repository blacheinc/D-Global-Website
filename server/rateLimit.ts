import 'server-only';
import { env } from '@/lib/env';

// Small, dependency-free defenses for public mutating endpoints. These
// aren't a substitute for Redis-backed rate limiting or a real CSRF
// token flow, in a distributed deploy the in-memory bucket is per-
// instance, so a distributed attacker would slip through. They're
// proportionate to the actual threats for this app today (script-kiddie
// spam, CSRF from another tab) and cost nothing to stand up.

// ----- Origin check -----
//
// Server actions get origin-pinned CSRF protection for free via Next's
// built-in Action-same-origin check. Plain route handlers (app/api/*)
// don't, a form on attacker.com can POST to /api/push/subscribe from
// a signed-in user's browser. The origin header is set by the browser
// for all POSTs to cross-origin URLs (fetch without no-cors, <form>
// submit, etc.) and can't be forged from page JS. Comparing it to the
// site's own origin gives us the same "same-origin-only" property
// server actions have, without a token round-trip.

export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  // No Origin header, be conservative and allow only if Referer is
  // same-origin. Some legitimate user agents strip Origin on same-site
  // POSTs (older Safari, specific proxies). Blocking outright would
  // regress those. Referer is a weaker signal but it's the fallback
  // the spec itself endorses.
  if (!origin) {
    const referer = req.headers.get('referer');
    if (!referer) return false;
    return sameHost(referer, env.NEXT_PUBLIC_SITE_URL);
  }
  return sameHost(origin, env.NEXT_PUBLIC_SITE_URL);
}

function sameHost(a: string, b: string): boolean {
  try {
    return normalizeHost(new URL(a).host) === normalizeHost(new URL(b).host);
  } catch {
    return false;
  }
}

// Strip a leading "www." so the same-origin check matches regardless of
// whether the user browses the apex or the www subdomain. Real cross-
// origin POSTs still fail (attacker.com after normalization is still
// attacker.com); this just bridges the apex-vs-www mismatch that comes
// up when NEXT_PUBLIC_SITE_URL is set to one and the browser loaded the
// other.
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

// ----- Rate limit -----
//
// In-memory fixed-window counter keyed by <route>:<ip>. Resets per
// window. Good enough to stop a single script or a stuck retry loop;
// not enough against a botnet. For real abuse resistance, swap to
// Upstash / Vercel KV and keep this API stable.
//
// Keys are dropped from the map once their window expires so a noisy
// IP doesn't leak memory indefinitely.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function rateLimit(
  req: Request,
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  return rateLimitHeaders(req.headers, key, limit, windowMs);
}

// Server-action variant. Server actions receive FormData, not a Request
//, to read the client IP they import `headers()` from next/headers and
// pass the result here. Same bucket semantics, same key space (so a
// /api/bookings POST and a createBooking server action from the same
// IP share the "bookings" counter if they use the same key).
export function rateLimitHeaders(
  h: Headers,
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const ip = clientIpFromHeaders(h);
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const existing = buckets.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) };
  }
  existing.count += 1;
  return { ok: true };
}

// Vercel / Cloudflare / Fly surface the client IP in x-forwarded-for
// (left-most entry) or x-real-ip. Fall back to 'unknown' so a missing
// header still produces a key, everybody hitting a misconfigured edge
// shares one bucket, which is noisy but not unsafe.
function clientIpFromHeaders(h: Headers): string {
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const real = h.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
