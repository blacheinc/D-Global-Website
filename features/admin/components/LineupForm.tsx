'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { LineupSlot } from '@prisma/client';
import { Input, Label, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { upsertLineupSlot, type LineupFormState } from '../lineupActions';

type Initial = Partial<
  Pick<LineupSlot, 'id' | 'displayName' | 'role' | 'slotStart' | 'order' | 'artistId'>
>;

type ArtistOption = { id: string; stageName: string };

function toLocalInput(d: Date | null | undefined): string {
  if (!d) return '';
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

const initialState: LineupFormState = { ok: false };

export function LineupForm({
  eventId,
  artists,
  initial,
  onDone,
}: {
  eventId: string;
  artists: ArtistOption[];
  initial?: Initial;
  onDone?: () => void;
}) {
  const router = useRouter();
  const action = upsertLineupSlot.bind(null, eventId, initial?.id ?? null);
  const [state, formAction, pending] = useActionState(action, initialState);
  const fe = state.fieldErrors ?? {};
  const formRef = useRef<HTMLFormElement>(null);

  // See TicketTypeForm for the rationale, reset on CREATE, refresh
  // route so the list above picks up the new row, depend on state
  // object identity so repeated successes re-fire.
  useEffect(() => {
    if (state.ok) {
      onDone?.();
      if (!initial?.id) formRef.current?.reset();
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
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={initial?.displayName ?? ''}
            required
            aria-invalid={!!fe.displayName}
          />
          <FieldError>{fe.displayName?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="role">Role (optional)</Label>
          <Input
            id="role"
            name="role"
            defaultValue={initial?.role ?? ''}
            placeholder="Headliner, Opener, Host…"
            aria-invalid={!!fe.role}
          />
          <FieldError>{fe.role?.[0]}</FieldError>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="artistId">Link to artist (optional)</Label>
          <select
            id="artistId"
            name="artistId"
            defaultValue={initial?.artistId ?? ''}
            className="w-full rounded-xl bg-elevated border border-white/10 px-4 py-3 text-foreground focus:outline-none focus:border-accent"
          >
            <option value="">- none -</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.stageName}
              </option>
            ))}
          </select>
          <FieldError>{fe.artistId?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="slotStart">Slot start (optional)</Label>
          <Input
            type="datetime-local"
            id="slotStart"
            name="slotStart"
            defaultValue={toLocalInput(initial?.slotStart)}
            aria-invalid={!!fe.slotStart}
          />
          <FieldError>{fe.slotStart?.[0]}</FieldError>
        </div>
      </div>
      <div>
        <Label htmlFor="order">Display order</Label>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          id="order"
          name="order"
          defaultValue={initial?.order ?? 0}
          required
          aria-invalid={!!fe.order}
        />
        <FieldError>{fe.order?.[0]}</FieldError>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? 'Saving…' : initial?.id ? 'Save slot' : 'Add slot'}
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
