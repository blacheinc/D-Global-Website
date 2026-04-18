import * as Sentry from '@sentry/nextjs';

// Next.js instrumentation hook. Runs once per server process boot, before
// any request is handled. We use it to wire up Sentry's server/edge
// initialization (the client config is loaded automatically by the SDK
// from sentry.client.config.ts).
//
// In Next.js 15 the instrumentation hook is enabled by default, we don't
// need experimental.instrumentationHook in next.config.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Capture errors that bubble out of route handlers, RSCs, or Server
// Actions. Sentry's onRequestError integrates with the route + runtime
// context so events arrive tagged with the path and method. Static
// import: register() always loads the SDK first, so the module is hot
// by the time this fires.
export const onRequestError = Sentry.captureRequestError;
