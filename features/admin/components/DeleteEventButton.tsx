'use client';

import { useState, useTransition } from 'react';
import { deleteEvent } from '../eventActions';

// Minimal client wrapper around the server action so we can:
// 1. Show a confirm() prompt before destructive delete (no easy way to
//    do this from a pure RSC <form>).
// 2. Use useTransition to disable the button during the round-trip
//    rather than a full page navigation.
// 3. Surface the action's structured error inline, a throw would bubble
//    to the error boundary and lose context. The common failure case
//    ("event has orders, can't delete") needs to show up where the
//    admin clicked, with actionable guidance.

export function DeleteEventButton({ id, title }: { id: string; title: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          if (!confirm(`Delete "${title}"? This will cascade to ticket types and lineup slots.`)) return;
          startTransition(async () => {
            const res = await deleteEvent(id);
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
