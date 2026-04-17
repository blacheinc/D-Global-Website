'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
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
