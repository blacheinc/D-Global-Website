// Next.js instrumentation hook. Runs once per server process boot, before
// any request is handled. We use it to wire up Sentry's server/edge
// initialization (the client config is loaded automatically by the SDK
// from sentry.client.config.ts).
//
// next.config.mjs sets `experimental.instrumentationHook = true` to enable
// this in Next.js 14; in Next.js 15 it's on by default but the flag is a
// no-op rather than an error, so we leave it for clarity.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Capture nested errors that React would otherwise swallow (e.g. errors
// thrown in RSC streaming). Sentry's onRequestError integrates with the
// route and runtime context so events arrive tagged.
export async function onRequestError(
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
) {
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
}
