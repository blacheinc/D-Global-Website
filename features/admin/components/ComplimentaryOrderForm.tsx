'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Label, Textarea, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { formatPriceMinor } from '@/lib/formatCurrency';
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

export function ComplimentaryOrderForm({ eventId, tiers }: ComplimentaryOrderFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const action = generateComplimentaryOrder.bind(null, eventId);
  const [state, formAction, pending] = useActionState(action, initial);

  // Reset the form on a successful issue so the admin can grant the
  // next comp without manually clearing fields. router.refresh()
  // pulls the fresh recent-comps list rendered by the parent page.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  if (tiers.length === 0) {
    return (
      <p className="text-sm text-muted">
        Add at least one ticket tier to this event before issuing comps.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-6 max-w-2xl">
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
            : 'Email send failed — use the order detail page to resend.'}
        </div>
      )}

      <div>
        <Label htmlFor="ticketTypeId">Tier</Label>
        <div className="grid gap-2">
          {tiers.map((t, i) => {
            const remaining = Math.max(0, t.quota - t.sold);
            return (
              <label
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-elevated px-4 py-3 cursor-pointer hover:border-white/20 has-[:checked]:border-accent has-[:checked]:bg-accent/5"
              >
                <input
                  type="radio"
                  name="ticketTypeId"
                  value={t.id}
                  defaultChecked={i === 0}
                  className="accent-accent"
                />
                <div className="flex-1">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted">
                    {t.tier.replace('_', ' ')} · {formatPriceMinor(t.priceMinor)} ·{' '}
                    {remaining === 0 ? 'Sold out' : `${remaining} left`}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
        <FieldError>{fe.ticketTypeId?.[0]}</FieldError>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="buyerName">Recipient name</Label>
          <Input id="buyerName" name="buyerName" required aria-invalid={!!fe.buyerName} />
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
            defaultValue={1}
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
          aria-invalid={!!fe.note}
        />
        <FieldError>{fe.note?.[0]}</FieldError>
        <p className="mt-1 text-xs text-muted">
          Visible to admins on the order detail page. Never sent to the recipient.
        </p>
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Issuing…' : 'Issue complimentary tickets'}
        </Button>
      </div>
    </form>
  );
}
