'use client';

import { useActionState } from 'react';
import { Input, Label, Textarea, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { broadcastPush, type BroadcastFormState } from '../pushActions';

const initialState: BroadcastFormState = { ok: false };

export function BroadcastForm() {
  const [state, formAction, pending] = useActionState(broadcastPush, initialState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-6 max-w-xl">
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
      <Button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Broadcast'}
      </Button>
    </form>
  );
}
