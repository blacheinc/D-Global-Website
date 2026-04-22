'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Label, FieldError } from '@/components/ui/Input';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { isStrictEmail, normaliseEmail } from '@/lib/email';
import { cn } from '@/lib/utils';
import type { TicketType } from '@prisma/client';

interface TicketCheckoutProps {
  eventId: string;
  ticketTypes: TicketType[];
  paystackMode: 'link' | 'api';
}

export function TicketCheckout({ eventId, ticketTypes, paystackMode }: TicketCheckoutProps) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalMinor = useMemo(
    () =>
      ticketTypes.reduce(
        (sum, t) => sum + (qty[t.id] ?? 0) * t.priceMinor,
        0,
      ),
    [qty, ticketTypes],
  );
  const totalQty = useMemo(
    () => Object.values(qty).reduce((a, b) => a + b, 0),
    [qty],
  );

  const setQ = (id: string, next: number) =>
    setQty((prev) => ({ ...prev, [id]: Math.max(0, Math.min(20, next)) }));

  const linkModeTicket = ticketTypes.find((t) => (qty[t.id] ?? 0) > 0 && t.paymentLinkUrl);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (totalQty === 0) {
      setError('Select at least one ticket.');
      return;
    }
    if (paystackMode === 'link') {
      if (linkModeTicket?.paymentLinkUrl) {
        window.location.href = linkModeTicket.paymentLinkUrl;
        return;
      }
      setError(
        'This event has no hosted payment link configured. Ask D Global Entertainment on WhatsApp or contact the venue to complete purchase.',
      );
      return;
    }

    // Pre-validate the email on the client so we never fire the
    // server round-trip (and its Paystack round-trip) with an address
    // our own validator rejects. isStrictEmail mirrors what the server
    // applies at the Zod boundary.
    const cleanEmail = normaliseEmail(buyer.email);
    if (!isStrictEmail(cleanEmail)) {
      setError('Enter a valid email address before continuing.');
      return;
    }

    setSubmitting(true);
    try {
      const items = ticketTypes
        .filter((t) => (qty[t.id] ?? 0) > 0)
        .map((t) => ({ ticketTypeId: t.id, quantity: qty[t.id]! }));

      const res = await fetch('/api/checkout/paystack', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId,
          items,
          buyer: { ...buyer, email: cleanEmail },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Server may return either a plain string (config / upstream errors)
        // or a structured zod flatten() object (validation errors). Coerce
        // anything non-string to a friendly fallback so we never render
        // "[object Object]" to the user.
        const msg =
          typeof json?.error === 'string' ? json.error : 'Please check your details and try again.';
        throw new Error(msg);
      }
      window.location.href = json.authorization_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-3">
        {ticketTypes.map((t) => {
          const q = qty[t.id] ?? 0;
          const soldOut = t.sold >= t.quota;
          return (
            <div
              key={t.id}
              className={cn(
                'rounded-2xl border border-white/10 bg-surface p-5 md:p-6',
                q > 0 && 'border-accent/60 shadow-glow-sm',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-accent">{t.tier.replace('_', ' ')}</p>
                  <h3 className="mt-1 font-display text-xl">{t.name}</h3>
                  {t.description && <p className="mt-1 text-sm text-muted max-w-md">{t.description}</p>}
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl">{formatPriceMinor(t.priceMinor)}</p>
                  {soldOut && <p className="text-xs text-accent uppercase">Sold out</p>}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end">
                <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-elevated px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setQ(t.id, q - 1)}
                    disabled={q === 0 || soldOut}
                    className="grid h-7 w-7 place-items-center rounded-full bg-white/10 disabled:opacity-40 hover:bg-white/15"
                    aria-label={`Decrease ${t.name} quantity`}
                  >
                    <Minus aria-hidden className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center tabular-nums" aria-live="polite">
                    {q}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQ(t.id, q + 1)}
                    disabled={soldOut || q >= t.quota - t.sold}
                    className="grid h-7 w-7 place-items-center rounded-full bg-accent text-white disabled:opacity-40 hover:bg-accent-hot"
                    aria-label={`Increase ${t.name} quantity`}
                  >
                    <Plus aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {paystackMode === 'api' && (
        <div className="grid gap-4 rounded-2xl border border-white/10 bg-surface p-5 md:p-6">
          <p className="eyebrow">Your details</p>
          <div>
            <Label htmlFor="buyer-name">Full name</Label>
            <Input
              id="buyer-name"
              required
              value={buyer.name}
              onChange={(e) => setBuyer((b) => ({ ...b, name: e.target.value }))}
              placeholder="As on your ID"
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="buyer-email">Email</Label>
              <Input
                id="buyer-email"
                type="email"
                required
                value={buyer.email}
                onChange={(e) => setBuyer((b) => ({ ...b, email: e.target.value }))}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <Label htmlFor="buyer-phone">Phone</Label>
              <Input
                id="buyer-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={buyer.phone}
                onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value }))}
                placeholder="+233 XX XXX XXXX"
              />
            </div>
          </div>
        </div>
      )}

      <div className="sticky bottom-20 md:bottom-0 rounded-2xl border border-white/10 bg-background/90 backdrop-blur p-5 md:p-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted">Total</p>
          <p className="font-display text-3xl">{formatPriceMinor(totalMinor)}</p>
        </div>
        <Button type="submit" variant="primary" size="lg" disabled={totalQty === 0 || submitting}>
          {submitting ? (
            <>
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Redirecting…
            </>
          ) : paystackMode === 'link' ? (
            `Pay with Paystack`
          ) : (
            `Checkout · ${totalQty} ${totalQty === 1 ? 'ticket' : 'tickets'}`
          )}
        </Button>
      </div>

      <FieldError>{error}</FieldError>

      <p className="text-xs text-muted">
        By continuing you agree to our terms. Tickets are delivered instantly after payment; you'll
        get a QR code valid at the door.
      </p>
    </form>
  );
}
