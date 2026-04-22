'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Label, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createScanToken, type ScanTokenFormState } from '../scanTokenActions';

const initialState: ScanTokenFormState = { ok: false };

export function ScanTokenForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const action = createScanToken.bind(null, eventId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const fe = state.fieldErrors ?? {};
  const formRef = useRef<HTMLFormElement>(null);

  // Reset + refresh on success so the new token row appears in the
  // list above without page navigation, and the form is ready for the
  // next gate/link.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {state.error && (
        <div role="alert" className="rounded-lg border border-accent-hot/40 bg-accent-hot/10 px-3 py-2 text-xs">
          {state.error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="label">Label (optional)</Label>
          <Input
            id="label"
            name="label"
            placeholder="Gate A, VIP entry, etc."
            maxLength={80}
            aria-invalid={!!fe.label}
          />
          <FieldError>{fe.label?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="expiresAt">Expires (optional)</Label>
          <Input
            type="datetime-local"
            id="expiresAt"
            name="expiresAt"
            aria-invalid={!!fe.expiresAt}
          />
          <FieldError>{fe.expiresAt?.[0]}</FieldError>
        </div>
      </div>
      <Button type="submit" disabled={pending} size="sm">
        {pending ? 'Generating…' : 'Generate scanner link'}
      </Button>
    </form>
  );
}
