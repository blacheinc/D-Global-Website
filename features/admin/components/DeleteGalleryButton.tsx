'use client';

import { useState, useTransition } from 'react';
import { deleteGalleryImage } from '../galleryActions';

export function DeleteGalleryButton({
  id,
  caption,
}: {
  id: string;
  caption?: string | null;
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
          if (!confirm(`Remove ${caption ? `"${caption}"` : 'this image'} from the gallery?`)) return;
          startTransition(async () => {
            const res = await deleteGalleryImage(id);
            if (!res.ok) setError(res.error);
          });
        }}
        className="text-xs uppercase tracking-[0.18em] text-muted hover:text-accent-hot transition-colors disabled:opacity-50"
      >
        {pending ? 'Removing…' : 'Remove'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-accent-hot text-right">
          {error}
        </p>
      )}
    </div>
  );
}
