'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { revokeScanToken } from '../scanTokenActions';

export function RevokeScanTokenButton({
  eventId,
  id,
  label,
}: {
  eventId: string;
  id: string;
  label: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    const display = label ? `"${label}"` : 'this scanner link';
    if (!confirm(`Revoke ${display}? Scanners using it will stop working.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await revokeScanToken(eventId, id);
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
        {pending ? 'Revoking…' : 'Revoke'}
      </button>
      {error && (
        <p role="alert" className="text-[11px] text-accent-hot">
          {error}
        </p>
      )}
    </div>
  );
}
