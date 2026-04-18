'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/Button';

// Per-segment error boundary. Catches errors from any RSC, client
// component, or Server Action below this segment. This is the *common*
// error path — global-error.tsx only fires when the root layout itself
// crashes. Both must explicitly capture; Sentry doesn't auto-instrument
// React error boundaries.

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // `source` is a low-cardinality categorical tag; `digest` is a
    // per-error identifier (Next.js ships only the digest to the browser;
    // the full stack stays on the server) and goes in `extra` to avoid
    // blowing out Sentry's tag-value index.
    Sentry.captureException(error, {
      tags: { source: 'route-error' },
      extra: { digest: error.digest },
    });
    console.error(error);
  }, [error]);

  return (
    <section className="min-h-[70vh] grid place-items-center container-px">
      <div className="text-center max-w-md">
        <p className="eyebrow justify-center mb-6">Error</p>
        <h1 className="font-display text-display-lg">Something went dark.</h1>
        <p className="mt-4 text-muted text-sm">
          An unexpected error occurred. Try again, or head back to the homepage.
        </p>
        <div className="mt-8 flex gap-3 justify-center">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    </section>
  );
}
