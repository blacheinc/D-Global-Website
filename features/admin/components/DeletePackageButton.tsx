'use client';

import { useState, useTransition } from 'react';
import { deletePackage } from '../packageActions';

export function DeletePackageButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          if (!confirm(`Delete "${name}"?`)) return;
          startTransition(async () => {
            const res = await deletePackage(id);
            if (!res.ok) setError(res.error);
          });
        }}
        className="text-xs uppercase tracking-[0.18em] text-muted hover:text-accent-hot transition-colors disabled:opacity-50"
      >
        {pending ? 'Deleting…' : 'Delete'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-accent-hot max-w-xs text-right">
          {error}
        </p>
      )}
    </div>
  );
}
