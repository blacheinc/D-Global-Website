import * as Sentry from '@sentry/nextjs';

// Browser-side error capture. Only initialized when a DSN is configured —
// missing DSN means we silently no-op so dev environments don't ship phantom
// noise to a Sentry project that doesn't exist.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Sample 10% of traces in production to keep quota predictable. Bump
    // temporarily during incident investigation, never set to 1.0 in prod.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Strip URLs from breadcrumbs that look like Paystack/QR tokens before
    // they leave the browser. The default scrubber catches Authorization
    // headers but not these custom signed payloads.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data?.url && typeof breadcrumb.data.url === 'string') {
        breadcrumb.data.url = breadcrumb.data.url.replace(/([?&]t=)[^&]+/g, '$1[scrubbed]');
      }
      return breadcrumb;
    },
  });
}
