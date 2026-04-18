'use client';

import { useState, useTransition } from 'react';
import { deleteLineupSlot } from '../lineupActions';

export function DeleteLineupButton({
  eventId,
  id,
  displayName,
}: {
  eventId: string;
  id: string;
  displayName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          if (!confirm(`Remove "${displayName}" from the lineup?`)) return;
          startTransition(async () => {
            const res = await deleteLineupSlot(eventId, id);
            if (!res.ok) setError(res.error);
          });
        }}
        className="text-xs uppercase tracking-[0.18em] text-muted hover:text-accent-hot transition-colors disabled:opacity-50"
      >
        {pending ? 'Removing…' : 'Remove'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-accent-hot max-w-xs text-right">
          {error}
        </p>
      )}
    </div>
  );
}
