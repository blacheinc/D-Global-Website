import 'server-only';
import * as Sentry from '@sentry/nextjs';

// Server-side error capture helper. Use inside catch blocks that swallow
// the error and return a safe response — without this, those branches are
// invisible to Sentry because `onRequestError` only fires for unhandled
// errors that bubble out of route handlers.
//
// Pattern:
//   try { ... } catch (err) {
//     captureError('[checkout] paystack initialize failed', err, { reference });
//     return NextResponse.json({ error: '...' }, { status: 502 });
//   }
//
// Always pass a stable string `prefix` — Sentry groups by stack frame, but
// the prefix shows up as the message and breadcrumb so it's grep-friendly
// in both Sentry and host log aggregation.

export function captureError(
  prefix: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  // Console first so the event lands in host logs even if Sentry is
  // unconfigured or rate-limited.
  console.error(prefix, err, context ?? {});
  Sentry.withScope((scope) => {
    scope.setTag('prefix', prefix);
    if (context) scope.setContext('extra', context);
    Sentry.captureException(err);
  });
}
