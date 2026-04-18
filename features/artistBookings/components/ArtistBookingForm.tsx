'use client';

import { useActionState } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Label, Textarea, FieldError } from '@/components/ui/Input';
import { createArtistBooking, type ArtistBookingActionState } from '../actions';
import { buildWaLink } from '@/lib/whatsapp';

interface ArtistBookingFormProps {
  artistId: string;
  artistName: string;
}

const initial: ArtistBookingActionState = { ok: false };

export function ArtistBookingForm({ artistId, artistName }: ArtistBookingFormProps) {
  const [state, formAction, pending] = useActionState(createArtistBooking, initial);

  const waHref = buildWaLink(
    `Hi D-Global, I'd like to book ${artistName}. Can we chat?`,
  );

  // Mirror features/bookings: wire zod error keys to each input via
  // aria-invalid + aria-describedby so SRs announce the message when
  // the field takes focus, not only the top-of-form banner.
  const fieldProps = (name: string) => {
    const hasErr = Boolean(state.fieldErrors?.[name]);
    return {
      'aria-invalid': hasErr || undefined,
      'aria-describedby': hasErr ? `${name}-err` : undefined,
    };
  };

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="artistId" value={artistId} />

      <div>
        <p className="eyebrow mb-5">Your details</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="ab-name">Full name</Label>
            <Input
              id="ab-name"
              name="requesterName"
              required
              autoComplete="name"
              placeholder="Who should we follow up with?"
              {...fieldProps('requesterName')}
            />
            <FieldError id="requesterName-err">{state.fieldErrors?.requesterName}</FieldError>
          </div>
          <div>
            <Label htmlFor="ab-email">Email</Label>
            <Input
              id="ab-email"
              name="requesterEmail"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              {...fieldProps('requesterEmail')}
            />
            <FieldError id="requesterEmail-err">{state.fieldErrors?.requesterEmail}</FieldError>
          </div>
          <div>
            <Label htmlFor="ab-phone">Phone (WhatsApp)</Label>
            <Input
              id="ab-phone"
              name="requesterPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder="+233 XX XXX XXXX"
              {...fieldProps('requesterPhone')}
            />
            <FieldError id="requesterPhone-err">{state.fieldErrors?.requesterPhone}</FieldError>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="ab-company">Company / promoter (optional)</Label>
            <Input
              id="ab-company"
              name="company"
              autoComplete="organization"
              placeholder="e.g. Accra Live Events"
              {...fieldProps('company')}
            />
            <FieldError id="company-err">{state.fieldErrors?.company}</FieldError>
          </div>
        </div>
      </div>

      <div>
        <p className="eyebrow mb-5">The show</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="ab-date">Event date</Label>
            <Input
              id="ab-date"
              name="eventDate"
              type="datetime-local"
              required
              {...fieldProps('eventDate')}
            />
            <FieldError id="eventDate-err">{state.fieldErrors?.eventDate}</FieldError>
          </div>
          <div>
            <Label htmlFor="ab-budget">Budget (GHS, optional)</Label>
            <Input
              id="ab-budget"
              name="budgetMinor"
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              placeholder="e.g. 50000"
              {...fieldProps('budgetMinor')}
            />
            <FieldError id="budgetMinor-err">{state.fieldErrors?.budgetMinor}</FieldError>
          </div>
          <div>
            <Label htmlFor="ab-venue">Venue name</Label>
            <Input
              id="ab-venue"
              name="venueName"
              required
              placeholder="Where's the show?"
              {...fieldProps('venueName')}
            />
            <FieldError id="venueName-err">{state.fieldErrors?.venueName}</FieldError>
          </div>
          <div>
            <Label htmlFor="ab-city">City</Label>
            <Input
              id="ab-city"
              name="city"
              required
              autoComplete="address-level2"
              placeholder="Accra"
              {...fieldProps('city')}
            />
            <FieldError id="city-err">{state.fieldErrors?.city}</FieldError>
          </div>
          <div>
            <Label htmlFor="ab-country">Country</Label>
            <Input
              id="ab-country"
              name="country"
              defaultValue="Ghana"
              autoComplete="country-name"
              {...fieldProps('country')}
            />
            <FieldError id="country-err">{state.fieldErrors?.country}</FieldError>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="ab-notes">Brief (optional)</Label>
            <Textarea
              id="ab-notes"
              name="notes"
              maxLength={2000}
              placeholder="Expected crowd size, type of show, set length, any specific requests…"
              {...fieldProps('notes')}
            />
            <FieldError id="notes-err">{state.fieldErrors?.notes}</FieldError>
          </div>
        </div>
      </div>

      {state.error && (
        <div role="alert" className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
          {state.error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <Button type="submit" variant="primary" size="lg" disabled={pending} className="flex-1">
          {pending ? (
            <>
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Sending request…
            </>
          ) : (
            `Request ${artistName}`
          )}
        </Button>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-2 h-14 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-foreground font-medium"
        >
          <MessageCircle aria-hidden className="h-4 w-4" /> Or WhatsApp us
        </a>
      </div>

      <p className="text-xs text-muted">
        We'll reply within 24 hours with availability and a quote. D-Global handles the contract,
        logistics, and rider end-to-end.
      </p>
    </form>
  );
}
