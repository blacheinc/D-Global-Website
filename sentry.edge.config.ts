import * as Sentry from '@sentry/nextjs';

// Edge runtime (middleware, edge route handlers, edge OG image). Smaller
// API surface than Node — no Node-specific integrations available.
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  // `release` auto-injected by the Sentry webpack plugin.
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}
