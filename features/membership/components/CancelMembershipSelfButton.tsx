'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { cancelMembershipSelf } from '../actions';

// Self-service cancel button for the /account dashboard. Calls the
// server action which disables the upstream Paystack subscription
// (best-effort) and flips local status to CANCELLED. The discount
// keeps applying through currentPeriodEnd, then lazy-expires.

export function CancelMembershipSelfButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onClick() {
    if (
      !confirm(
        "Cancel your D Global membership? You'll keep the discount until the end of your current period, then it expires automatically.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await cancelMembershipSelf();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  if (done) {
    return (
      <p role="status" className="text-sm text-muted">
        Cancellation queued. Your discount stays on through the end of the period.
      </p>
    );
  }

  return (
    <div>
      <Button type="button" variant="ghost" onClick={onClick} disabled={pending}>
        {pending ? 'Cancelling...' : 'Cancel membership'}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-accent-hot">
          {error}
        </p>
      )}
    </div>
  );
}
