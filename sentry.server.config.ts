import * as Sentry from '@sentry/nextjs';

// Server-side error capture (Node.js runtime). RSC, route handlers, and
// Server Actions all flow through this. The instrumentation hook below
// wires this up at process boot.
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Webhooks and the QR endpoint receive signed tokens in the URL — make
    // sure those never leave the server. Sentry's default scrubbers don't
    // know about our `t` query param.
    beforeSend(event) {
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/([?&]t=)[^&]+/g, '$1[scrubbed]');
      }
      return event;
    },
  });
}
