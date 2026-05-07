'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Label, Textarea, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { cn } from '@/lib/utils';
import {
  generateComplimentaryOrder,
  type GenerateCompResult,
} from '../orderActions';

type Tier = {
  id: string;
  name: string;
  tier: string;
  priceMinor: number;
  quota: number;
  sold: number;
};

interface ComplimentaryOrderFormProps {
  eventId: string;
  tiers: ReadonlyArray<Tier>;
}

const initial: GenerateCompResult | null = null;

// When consumeSeat is true, the comp draws from the tier quota: we
// only let the admin pick a tier that still has capacity. When false
// (the default) the comp is above-quota: any tier is fair game,
// including sold-out ones.
function firstAvailable(
  tiers: ReadonlyArray<Tier>,
  consumeSeat: boolean,
): string | null {
  if (!consumeSeat) return tiers[0]?.id ?? null;
  for (const t of tiers) {
    if (t.quota - t.sold > 0) return t.id;
  }
  return null;
}

export function ComplimentaryOrderForm({ eventId, tiers }: ComplimentaryOrderFormProps) {
  const router = useRouter();
  const action = generateComplimentaryOrder.bind(null, eventId);
  const [state, formAction, pending] = useActionState(action, initial);

  // Default to above-quota: comps don't shrink the door pool. Admin
  // can opt into a quota-consuming comp via the checkbox.
  const [consumeSeat, setConsumeSeat] = useState(false);

  // Controlled tier selection so we can react to consumeSeat toggling
  // (which changes which tiers are valid) and re-pick a sensible
  // default after each successful issue.
  const initialSelection = useMemo(
    () => firstAvailable(tiers, false),
    [tiers],
  );
  const [selectedTierId, setSelectedTierId] = useState<string | null>(initialSelection);
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [note, setNote] = useState('');

  // After a successful issue: clear the form fields and refresh the
  // parent so updated tier counts + the recent-comps list re-render.
  useEffect(() => {
    if (state?.ok) {
      setRecipientName('');
      setRecipientEmail('');
      setRecipientPhone('');
      setQuantity(1);
      setNote('');
      router.refresh();
    }
  }, [state, router]);

  // Keep the tier selection valid as either inventory or the
  // consume-seat toggle changes. If consumeSeat just flipped to true
  // and the chosen tier is now sold out, fall back to the next
  // available one. If consumeSeat is false, any tier is fine, only
  // re-pick when the current one was deleted upstream.
  useEffect(() => {
    if (selectedTierId) {
      const t = tiers.find((x) => x.id === selectedTierId);
      if (t && (!consumeSeat || t.quota - t.sold > 0)) return;
    }
    setSelectedTierId(firstAvailable(tiers, consumeSeat));
  }, [tiers, selectedTierId, consumeSeat]);

  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  if (tiers.length === 0) {
    return (
      <p className="text-sm text-muted">
        Add at least one ticket tier to this event before issuing comps.
      </p>
    );
  }

  // The allSoldOut empty state only applies when consumeSeat is on:
  // an above-quota comp can be issued against any tier regardless of
  // remaining inventory, so we still want the form rendered when
  // every tier is sold-out by default.
  const allSoldOut = tiers.every((t) => t.quota - t.sold <= 0);
  if (allSoldOut && consumeSeat) {
    return (
      <div className="rounded-2xl border border-white/10 bg-surface p-6 max-w-2xl space-y-3">
        <p className="font-medium">Every tier is sold out.</p>
        <p className="text-sm text-muted">
          Quota-consuming comps can't be issued once a tier is full. Either toggle off
          "Consume a seat from the tier quota" below to issue an above-quota comp, or free up
          capacity (refund an order, or raise the quota on the ticket-tiers page).
        </p>
        <label className="inline-flex items-center gap-3 text-sm pt-2">
          <input
            type="checkbox"
            checked={consumeSeat}
            onChange={(e) => setConsumeSeat(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Consume a seat from the tier quota
        </label>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6 max-w-2xl">
      {state && !state.ok && state.error && (
        <div role="alert" className="rounded-lg border border-accent-hot/40 bg-accent-hot/10 px-4 py-3 text-sm">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div role="status" className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          Comp issued. Reference{' '}
          <span className="font-mono">{state.reference.slice(0, 14)}</span>.{' '}
          {state.emailSent
            ? 'Email sent with the QR ticket attached.'
            : 'Email send failed, use the order detail page to resend.'}
        </div>
      )}

      <div>
        <Label htmlFor="ticketTypeId">Tier</Label>
        <div className="grid gap-2">
          {tiers.map((t) => {
            const remaining = Math.max(0, t.quota - t.sold);
            // Only refuse the tier when consumeSeat is on AND it's
            // sold out. Above-quota comps can use any tier regardless
            // of inventory.
            const disabled = consumeSeat && remaining === 0;
            return (
              <label
                key={t.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                  disabled
                    ? 'border-white/10 bg-elevated/40 opacity-60 cursor-not-allowed'
                    : 'border-white/10 bg-elevated cursor-pointer hover:border-white/20 has-[:checked]:border-accent has-[:checked]:bg-accent/5',
                )}
              >
                <input
                  type="radio"
                  name="ticketTypeId"
                  value={t.id}
                  checked={selectedTierId === t.id}
                  disabled={disabled}
                  onChange={() => setSelectedTierId(t.id)}
                  className="accent-accent"
                />
                <div className="flex-1">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted">
                    {t.tier.replace('_', ' ')} · {formatPriceMinor(t.priceMinor)}
                    {consumeSeat
                      ? ` · ${remaining === 0 ? 'Sold out' : `${remaining} left`}`
                      : ''}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
        <FieldError>{fe.ticketTypeId?.[0]}</FieldError>
      </div>

      <div className="rounded-xl border border-white/10 bg-elevated px-4 py-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="consumeSeat"
            checked={consumeSeat}
            onChange={(e) => setConsumeSeat(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-accent"
          />
          <span className="text-sm">
            <span className="font-medium">Consume a seat from the tier quota</span>
            <span className="block text-xs text-muted mt-0.5">
              Off (default): the comp lives above the quota; public availability is unchanged.
              On: the comp counts against the tier's sold counter, lowering the public count by
              the quantity issued. Use when you're papering the house and want the door numbers
              to reflect it.
            </span>
          </span>
        </label>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="buyerName">Recipient name</Label>
          <Input
            id="buyerName"
            name="buyerName"
            required
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            aria-invalid={!!fe.buyerName}
          />
          <FieldError>{fe.buyerName?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="buyerEmail">Recipient email</Label>
          <Input
            id="buyerEmail"
            name="buyerEmail"
            type="email"
            inputMode="email"
            required
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            aria-invalid={!!fe.buyerEmail}
            placeholder="press@example.com"
          />
          <FieldError>{fe.buyerEmail?.[0]}</FieldError>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="buyerPhone">Recipient phone (optional)</Label>
          <Input
            id="buyerPhone"
            name="buyerPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+233 XX XXX XXXX"
            value={recipientPhone}
            onChange={(e) => setRecipientPhone(e.target.value)}
            aria-invalid={!!fe.buyerPhone}
          />
          <FieldError>{fe.buyerPhone?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            required
            aria-invalid={!!fe.quantity}
          />
          <FieldError>{fe.quantity?.[0]}</FieldError>
        </div>
      </div>

      <div>
        <Label htmlFor="note">Internal note (optional)</Label>
        <Textarea
          id="note"
          name="note"
          maxLength={500}
          placeholder="Press: Pulse review · Birthday: Ama"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-invalid={!!fe.note}
        />
        <FieldError>{fe.note?.[0]}</FieldError>
        <p className="mt-1 text-xs text-muted">
          Visible to admins on the order detail page. Never sent to the recipient.
        </p>
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={pending || !selectedTierId}>
          {pending ? 'Issuing…' : 'Issue complimentary tickets'}
        </Button>
      </div>
    </form>
  );
}
