'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recheckPaystackStatus } from '../orderActions';

// Admin button that re-verifies an order against Paystack on demand.
// Most valuable when the webhook didn't fire (slow, misrouted, or the
// event wasn't wired up at the dashboard) and a buyer's order is
// stranded in PENDING. Also useful after marking FAILED if the buyer
// says they actually paid — the underlying transaction may still be
// verifiable on Paystack's side.
//
// Everything the button does happens in the server action; this
// component just surfaces the result string. router.refresh() pulls
// fresh order state so the status pill on the page updates without a
// manual reload.

export function RecheckPaymentButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  function onClick() {
    setMessage(null);
    startTransition(async () => {
      const res = await recheckPaystackStatus(orderId);
      if (!res.ok) {
        setMessage({ kind: 'error', text: res.error });
        return;
      }
      setMessage({ kind: 'ok', text: res.message });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-full border border-white/15 bg-surface px-4 py-2 text-xs uppercase tracking-[0.18em] text-foreground hover:border-accent/60 hover:text-accent disabled:opacity-50"
      >
        {pending ? 'Checking Paystack…' : 'Recheck with Paystack'}
      </button>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={
            message.kind === 'error'
              ? 'text-xs text-accent-hot'
              : 'text-xs text-muted max-w-sm'
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
