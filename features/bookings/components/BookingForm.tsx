'use client';

import { useActionState, useState } from 'react';
import { MessageCircle, Loader2 } from 'lucide-react';
import { PackageCard } from './PackageCard';
import { Button } from '@/components/ui/Button';
import { Input, Label, Textarea, FieldError } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { createBooking, type BookingActionState } from '../actions';
import { buildWaLink, buildBookingMessage } from '@/lib/whatsapp';
import type { Event, Package } from '@prisma/client';

interface BookingFormProps {
  packages: Package[];
  events: Array<Pick<Event, 'id' | 'slug' | 'title' | 'startsAt'>>;
  defaultPackageTier?: string;
  defaultEventId?: string;
}

const initial: BookingActionState = { ok: false };

export function BookingForm({
  packages,
  events,
  defaultPackageTier,
  defaultEventId,
}: BookingFormProps) {
  const [state, formAction, pending] = useActionState(createBooking, initial);
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(
    packages.find((p) => p.tier === defaultPackageTier)?.id ?? packages[0]?.id ?? null,
  );
  const [partySize, setPartySize] = useState(4);
  const [eventId, setEventId] = useState(defaultEventId ?? '');
  const [guestName, setGuestName] = useState('');

  const selectedPkg = packages.find((p) => p.id === selectedPkgId) ?? null;
  const selectedEvent = events.find((e) => e.id === eventId) ?? null;

  const waHref = selectedPkg
    ? buildWaLink(
        buildBookingMessage({
          packageName: selectedPkg.name,
          partySize,
          eventTitle: selectedEvent?.title ?? null,
          eventDate: selectedEvent ? new Date(selectedEvent.startsAt).toDateString() : null,
          guestName: guestName || '-',
        }),
      )
    : buildWaLink('Hi D Global Entertainment, I want to book a VIP table.');

  // Wire zod field errors to each input via aria-invalid + aria-describedby so
  // screen readers announce the validation message when focusing the field.
  const fieldProps = (name: string) => {
    const hasErr = Boolean(state.fieldErrors?.[name]);
    return {
      'aria-invalid': hasErr || undefined,
      'aria-describedby': hasErr ? `${name}-err` : undefined,
    };
  };

  return (
    <form action={formAction} className="space-y-10">
      <div>
        <p className="eyebrow mb-5">1. Choose a package</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              selected={pkg.id === selectedPkgId}
              onClick={() => setSelectedPkgId(pkg.id)}
            />
          ))}
        </div>
        <input type="hidden" name="packageTier" value={selectedPkg?.tier ?? ''} required />
        {state.fieldErrors?.packageTier && (
          <FieldError id="packageTier-err">{state.fieldErrors.packageTier}</FieldError>
        )}
      </div>

      <div>
        <p className="eyebrow mb-5">2. Your details</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="guestName">Full name</Label>
            <Input
              id="guestName"
              name="guestName"
              required
              placeholder="As it should appear on the reservation"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              autoComplete="name"
              {...fieldProps('guestName')}
            />
            <FieldError id="guestName-err">{state.fieldErrors?.guestName}</FieldError>
          </div>

          <div>
            <Label htmlFor="guestPhone">Phone (WhatsApp)</Label>
            <Input
              id="guestPhone"
              name="guestPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder="+233 XX XXX XXXX"
              {...fieldProps('guestPhone')}
            />
            <FieldError id="guestPhone-err">{state.fieldErrors?.guestPhone}</FieldError>
          </div>

          <div>
            <Label htmlFor="guestEmail">Email (optional)</Label>
            <Input
              id="guestEmail"
              name="guestEmail"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...fieldProps('guestEmail')}
            />
            <FieldError id="guestEmail-err">{state.fieldErrors?.guestEmail}</FieldError>
          </div>

          <div>
            <Label htmlFor="partySize">Party size</Label>
            <Input
              id="partySize"
              name="partySize"
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              required
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              {...fieldProps('partySize')}
            />
            <FieldError id="partySize-err">{state.fieldErrors?.partySize}</FieldError>
          </div>

          <div>
            <Label htmlFor="eventId">Which night?</Label>
            <Select
              id="eventId"
              name="eventId"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            >
              <option value="">No specific event</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              maxLength={500}
              placeholder="Birthdays, bottles, specific requests…"
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
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={pending || !selectedPkg}
          className="flex-1"
        >
          {pending ? (
            <>
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Sending request…
            </>
          ) : (
            'Reserve table'
          )}
        </Button>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-2 h-14 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-foreground font-medium"
        >
          <MessageCircle aria-hidden className="h-4 w-4" /> Continue on WhatsApp
        </a>
      </div>

      <p className="text-xs text-muted">
        We'll confirm your reservation on WhatsApp within an hour. Deposit, bottle selection and
        arrival instructions are handled in-chat.
      </p>
    </form>
  );
}
