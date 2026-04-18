'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Label, Textarea, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { broadcastPush, type BroadcastFormState } from '../pushActions';

const initialState: BroadcastFormState = { ok: false };

export function BroadcastForm({ subscriberCount }: { subscriberCount: number }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(broadcastPush, initialState);
  const fe = state.fieldErrors ?? {};
  const formRef = useRef<HTMLFormElement>(null);

  // After a successful broadcast: clear the form so a stray re-submit
  // doesn't duplicate the same push to the whole subscriber list, and
  // refresh the route so the header "N subscribers" count picks up any
  // 410-pruned rows that the sender removed.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-6 max-w-xl">
      {state.error && (
        <div role="alert" className="rounded-lg border border-accent-hot/40 bg-accent-hot/10 px-4 py-3 text-sm">
          {state.error}
        </div>
      )}
      {state.ok && state.result && (
        <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
          Sent to {state.result.attempted} subscribers · {state.result.delivered} delivered ·{' '}
          {state.result.removed} pruned · {state.result.failed} failed.
        </div>
      )}
      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required maxLength={120} aria-invalid={!!fe.title} />
        <FieldError>{fe.title?.[0]}</FieldError>
      </div>
      <div>
        <Label htmlFor="body">Message</Label>
        <Textarea id="body" name="body" required maxLength={500} aria-invalid={!!fe.body} />
        <FieldError>{fe.body?.[0]}</FieldError>
      </div>
      <div>
        <Label htmlFor="url">Click-through URL (optional)</Label>
        <Input
          type="url"
          id="url"
          name="url"
          placeholder="https://d-global.example/events/..."
          aria-invalid={!!fe.url}
        />
        <FieldError>{fe.url?.[0]}</FieldError>
      </div>
      <Button
        type="submit"
        disabled={pending || subscriberCount === 0}
        // Confirm via the submit button's onClick rather than wrapping the
        // form's `action` with a client function, that wrapper would keep
        // the form from passing the real useActionState `formAction` to
        // React, which is what drives the pending-state transition. Click
        // cancel → preventDefault stops the subsequent submit event; click
        // OK → preventDefault is skipped → form submits normally.
        onClick={(e) => {
          if (
            !confirm(
              `Send this notification to ${subscriberCount} subscriber${subscriberCount === 1 ? '' : 's'}? This can't be undone.`,
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        {pending ? 'Sending…' : 'Broadcast'}
      </Button>
      {subscriberCount === 0 && (
        <p className="text-xs text-muted">No subscribers yet, nothing to send.</p>
      )}
    </form>
  );
}
