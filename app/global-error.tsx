'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Catches errors thrown inside the root layout itself (font loading, env
// validation, etc.). When this fires, Next.js has unmounted the layout —
// we render our own <html>/<body>. Inline styles only: globals.css may not
// have loaded if the failure was early enough.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry's error boundary integration only catches errors below the
    // root layout. Global errors (the ones that unmount the layout) need
    // to be captured manually here. Tag with the digest so this client
    // event can be correlated with the matching server-side stack trace
    // in Sentry's UI. console.error keeps the message visible in host
    // logs for ops who don't have Sentry access.
    Sentry.captureException(error, {
      tags: { digest: error.digest ?? 'none', source: 'global-error' },
    });
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          background: '#000000',
          color: '#FFFFFF',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
          margin: 0,
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <p
            style={{
              fontSize: 12,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#C00000',
              margin: 0,
            }}
          >
            Something broke
          </p>
          <h1
            style={{
              marginTop: 16,
              fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
              lineHeight: 1.1,
              fontWeight: 600,
              letterSpacing: '-0.015em',
            }}
          >
            The night took an unexpected turn.
          </h1>
          <p style={{ marginTop: 16, color: '#B3B3B3', lineHeight: 1.5 }}>
            We've logged the issue and will look into it. Try again, or head back to the
            homepage.
          </p>
          <div
            style={{
              marginTop: 32,
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                background: '#C00000',
                color: '#FFFFFF',
                border: 'none',
                padding: '14px 28px',
                borderRadius: 9999,
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.15)',
                padding: '13px 27px',
                borderRadius: 9999,
                fontWeight: 500,
                textDecoration: 'none',
                fontSize: 14,
              }}
            >
              Back to home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
