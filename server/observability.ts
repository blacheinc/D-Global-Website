import 'server-only';
import * as Sentry from '@sentry/nextjs';

// Server-side error capture helper. Use inside catch blocks that swallow
// the error and return a safe response, without this, those branches are
// invisible to Sentry because `onRequestError` only fires for unhandled
// errors that bubble out of route handlers.
//
// Pattern:
//   try { ... } catch (err) {
//     const eventId = captureError('[checkout] paystack init failed', err, { reference });
//     return NextResponse.json({ error: '...', supportRef: eventId }, { status: 502 });
//   }
//
// Always pass a stable string `prefix`, Sentry groups by stack frame, but
// the prefix shows up as the message and tag so it's grep-friendly in both
// Sentry and host log aggregation.
//
// The returned event ID is the Sentry UUID for this capture; surface it to
// users as a "support reference" so a ticket like "Reference abc123def" can
// be looked up directly in Sentry. When Sentry is unconfigured (no DSN),
// captureException returns an empty string.
//
// Flushing: on serverless deployments (Vercel, Lambda) the function may
// freeze after responding, dropping in-flight events. Sentry's NextJS SDK
// auto-flushes *unhandled* errors via Vercel's waitUntil through its
// onRequestError integration. Explicit captures inside route handlers
// (like the calls below) are NOT covered by that mechanism, for
// high-stakes captures where event loss is unacceptable (e.g. fraud
// signals in the Paystack webhook), wrap the handler in try/finally and
// `await Sentry.flush(2000)` before responding. flush() is a no-op when
// the queue is empty, so success-path requests pay no latency.

export function captureError(
  prefix: string,
  err: unknown,
  context?: Record<string, unknown>,
): string {
  // Console first so the event lands in host logs even if Sentry is
  // unconfigured or rate-limited.
  console.error(prefix, err, context ?? {});
  // captureException's options arg builds a one-shot scope under the
  // hood, equivalent to withScope(), with less ceremony.
  return Sentry.captureException(err, {
    tags: { prefix },
    extra: context,
  });
}
