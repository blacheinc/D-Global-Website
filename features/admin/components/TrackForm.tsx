'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Track } from '@prisma/client';
import { Input, Label, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { upsertTrack, type TrackFormState } from '../releaseActions';

type Initial = Partial<Track>;
const initialState: TrackFormState = { ok: false };

export function TrackForm({
  releaseId,
  initial,
  onDone,
}: {
  releaseId: string;
  initial?: Initial;
  onDone?: () => void;
}) {
  const router = useRouter();
  const action = upsertTrack.bind(null, releaseId, initial?.id ?? null);
  const [state, formAction, pending] = useActionState(action, initialState);
  const fe = state.fieldErrors ?? {};
  const formRef = useRef<HTMLFormElement>(null);

  // Same pattern as TicketTypeForm / LineupForm, reset on successful
  // CREATE, refresh route so the list above picks up the new row.
  useEffect(() => {
    if (state.ok) {
      onDone?.();
      if (!initial?.id) formRef.current?.reset();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {state.error && (
        <div role="alert" className="rounded-lg border border-accent-hot/40 bg-accent-hot/10 px-3 py-2 text-xs">
          {state.error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" defaultValue={initial?.title} required aria-invalid={!!fe.title} />
          <FieldError>{fe.title?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="durationSec">Duration (s)</Label>
          <Input
            type="number"
            min={0}
            id="durationSec"
            name="durationSec"
            defaultValue={initial?.durationSec ?? ''}
            aria-invalid={!!fe.durationSec}
          />
          <FieldError>{fe.durationSec?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="order">Order</Label>
          <Input
            type="number"
            min={0}
            id="order"
            name="order"
            defaultValue={initial?.order ?? 0}
            required
            aria-invalid={!!fe.order}
          />
          <FieldError>{fe.order?.[0]}</FieldError>
        </div>
      </div>
      <div>
        <Label htmlFor="spotifyId">Spotify track ID (optional)</Label>
        <Input
          id="spotifyId"
          name="spotifyId"
          defaultValue={initial?.spotifyId ?? ''}
          placeholder="4uLU6hMCjMI75M1A2tKUQC"
          aria-invalid={!!fe.spotifyId}
        />
        <FieldError>{fe.spotifyId?.[0]}</FieldError>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? 'Saving…' : initial?.id ? 'Save track' : 'Add track'}
        </Button>
        {state.ok && !pending && (
          <span role="status" className="text-xs text-emerald-400">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}
