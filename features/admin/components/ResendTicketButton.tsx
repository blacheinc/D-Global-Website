'use client';

import { useState, useTransition } from 'react';
import { resendTicketEmail } from '../orderActions';

// Admin-only button that re-fires the confirmation email with a freshly
// built PDF attachment. Used when a buyer never received the original
// (spam folder, typo'd address after an edit, replaced their phone and
// wants another copy). Server action handles the admin gate; this
// component is just the UI + confirm + status surface.

export function ResendTicketButton({
  orderId,
  buyerEmail,
  disabled,
}: {
  orderId: string;
  buyerEmail: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  function onClick() {
    if (!confirm(`Resend the ticket email to ${buyerEmail}?`)) return;
    setMessage(null);
    startTransition(async () => {
      const res = await resendTicketEmail(orderId);
      if (!res.ok) {
        setMessage({ kind: 'error', text: res.error });
        return;
      }
      setMessage({ kind: 'ok', text: `Sent to ${buyerEmail}.` });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={pending || disabled}
        className="rounded-full border border-white/15 bg-surface px-4 py-2 text-xs uppercase tracking-[0.18em] text-foreground hover:border-accent/60 hover:text-accent disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Resend ticket email'}
      </button>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={
            message.kind === 'error'
              ? 'text-xs text-accent-hot'
              : 'text-xs text-muted'
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
