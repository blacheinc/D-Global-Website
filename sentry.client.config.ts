import * as Sentry from '@sentry/nextjs';

// Browser-side error capture. Only initialized when a DSN is configured —
// missing DSN means we silently no-op so dev environments don't ship phantom
// noise to a Sentry project that doesn't exist.
//
// Sentry v8 still loads this file via the SDK's webpack plugin. The Next 15
// `instrumentation-client.ts` convention (preferred from Sentry v9) is a
// future migration; both are supported on our current SDK.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  // Don't pass `release` here — the Sentry webpack plugin auto-injects it
  // at build time from SENTRY_RELEASE / VERCEL_GIT_COMMIT_SHA / git SHA.
  // Setting `release: undefined` would prevent that auto-injection.
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Sample 10% of traces in production to keep quota predictable. Bump
    // temporarily during incident investigation, never set to 1.0 in prod.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Strip URLs from breadcrumbs that look like Paystack/QR tokens before
    // they leave the browser. The default scrubber catches Authorization
    // headers but not these custom signed payloads.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data?.url && typeof breadcrumb.data.url === 'string') {
        breadcrumb.data.url = breadcrumb.data.url.replace(/([?&]t=)[^&]+/g, '$1[scrubbed]');
      }
      return breadcrumb;
    },
    beforeSend(event) {
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/([?&]t=)[^&]+/g, '$1[scrubbed]');
      }
      return event;
    },
  });
}
