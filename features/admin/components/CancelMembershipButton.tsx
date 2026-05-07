'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelMembership } from '../membershipActions';

// Sets the membership to CANCELLED + stamps cancelledAt. Doesn't expire
// it immediately, the discount keeps applying until currentPeriodEnd
// passes (matching how Paystack auto-renew cancellations behave).

export function CancelMembershipButton({
  id,
  email,
}: {
  id: string;
  email: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (
      !confirm(
        `Cancel membership for ${email}? They keep the discount through the end of the current period, then it expires automatically.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await cancelMembership(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-xs uppercase tracking-[0.18em] text-accent-hot hover:text-accent disabled:opacity-50"
      >
        {pending ? 'Cancelling...' : 'Cancel'}
      </button>
      {error && (
        <p role="alert" className="text-[11px] text-accent-hot">
          {error}
        </p>
      )}
    </div>
  );
}
