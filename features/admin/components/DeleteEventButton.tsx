'use client';

import { useTransition } from 'react';
import { deleteEvent } from '../eventActions';

// Minimal client wrapper around the server action so we can:
// 1. Show a confirm() prompt before destructive delete (no easy way to
//    do this from a pure RSC <form>).
// 2. Use useTransition to disable the button during the round-trip
//    rather than a full page navigation.

export function DeleteEventButton({ id, title }: { id: string; title: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete "${title}"? This will cascade to ticket types, orders, and lineup slots.`)) return;
        startTransition(async () => {
          await deleteEvent(id);
        });
      }}
      className="text-xs uppercase tracking-[0.18em] text-muted hover:text-accent-hot transition-colors disabled:opacity-50"
    >
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  );
}
