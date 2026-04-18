'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { TicketTier, TicketType } from '@prisma/client';
import { Input, Label, Textarea, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { upsertTicketType, type TicketTypeFormState } from '../ticketTypeActions';

type Initial = Partial<Pick<TicketType,
  'id' | 'tier' | 'name' | 'description' | 'priceMinor' | 'currency' | 'quota' |
  'salesStart' | 'salesEnd' | 'paymentLinkUrl'
>>;

const TIERS: TicketTier[] = ['EARLY_BIRD', 'REGULAR', 'VIP', 'TABLE'];

function toLocalInput(d: Date | null | undefined): string {
  if (!d) return '';
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

const initialState: TicketTypeFormState = { ok: false };

export function TicketTypeForm({
  eventId,
  initial,
  onDone,
}: {
  eventId: string;
  initial?: Initial;
  onDone?: () => void;
}) {
  const router = useRouter();
  const action = upsertTicketType.bind(null, eventId, initial?.id ?? null);
  const [state, formAction, pending] = useActionState(action, initialState);
  const fe = state.fieldErrors ?? {};
  const formRef = useRef<HTMLFormElement>(null);

  // After each successful submission: fire onDone (if provided), reset
  // the form so the admin can add another tier without clearing fields
  // by hand, and refresh the route so the tier list above the form
  // picks up the new row. Depend on the state object identity (not
  // state.ok) so repeated successes re-trigger, the "Add a tier" form
  // stays mounted and is used multiple times in a row. Only reset on
  // CREATE; on EDIT we want the updated values to persist.
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
          <Label htmlFor="tier">Tier</Label>
          <select
            id="tier"
            name="tier"
            defaultValue={initial?.tier ?? 'REGULAR'}
            className="w-full rounded-xl bg-elevated border border-white/10 px-4 py-3 text-foreground focus:outline-none focus:border-accent"
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </select>
          <FieldError>{fe.tier?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="name">Display name</Label>
          <Input id="name" name="name" defaultValue={initial?.name} required aria-invalid={!!fe.name} />
          <FieldError>{fe.name?.[0]}</FieldError>
        </div>
      </div>
      <div>
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={initial?.description ?? ''}
          aria-invalid={!!fe.description}
        />
        <FieldError>{fe.description?.[0]}</FieldError>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="priceMinor">Price (in minor units)</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            id="priceMinor"
            name="priceMinor"
            required
            defaultValue={initial?.priceMinor ?? ''}
            aria-invalid={!!fe.priceMinor}
          />
          <FieldError>{fe.priceMinor?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            name="currency"
            defaultValue={initial?.currency ?? 'GHS'}
            maxLength={3}
            required
            aria-invalid={!!fe.currency}
          />
          <FieldError>{fe.currency?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="quota">Quota</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            id="quota"
            name="quota"
            required
            defaultValue={initial?.quota ?? ''}
            aria-invalid={!!fe.quota}
          />
          <FieldError>{fe.quota?.[0]}</FieldError>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="salesStart">Sales start (optional)</Label>
          <Input
            type="datetime-local"
            id="salesStart"
            name="salesStart"
            defaultValue={toLocalInput(initial?.salesStart)}
            aria-invalid={!!fe.salesStart}
          />
          <FieldError>{fe.salesStart?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="salesEnd">Sales end (optional)</Label>
          <Input
            type="datetime-local"
            id="salesEnd"
            name="salesEnd"
            defaultValue={toLocalInput(initial?.salesEnd)}
            aria-invalid={!!fe.salesEnd}
          />
          <FieldError>{fe.salesEnd?.[0]}</FieldError>
        </div>
      </div>
      <div>
        <Label htmlFor="paymentLinkUrl">Paystack payment link (link mode, optional)</Label>
        <Input
          type="url"
          id="paymentLinkUrl"
          name="paymentLinkUrl"
          defaultValue={initial?.paymentLinkUrl ?? ''}
          placeholder="https://paystack.com/pay/..."
          aria-invalid={!!fe.paymentLinkUrl}
        />
        <FieldError>{fe.paymentLinkUrl?.[0]}</FieldError>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? 'Saving…' : initial?.id ? 'Save tier' : 'Add tier'}
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
