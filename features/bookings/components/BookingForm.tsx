'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { PackageCard } from './PackageCard';
import { Button } from '@/components/ui/Button';
import { Input, Label, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { buildWaLink } from '@/lib/whatsapp';
import type { Event, Package } from '@prisma/client';

interface BookingFormProps {
  packages: Package[];
  events: Array<Pick<Event, 'id' | 'slug' | 'title' | 'startsAt'>>;
  defaultPackageTier?: string;
  defaultEventId?: string;
}

// VIP table booking is WhatsApp-only. We collect the basics inline,
// pre-fill a WA message, and open wa.me, the rest (deposit, bottle
// selection, arrival instructions) is handled in-chat with a human.
// No DB write, no server action. features/bookings/actions.ts still
// exists unchanged if we want to turn capture back on later.
export function BookingForm({
  packages,
  events,
  defaultPackageTier,
  defaultEventId,
}: BookingFormProps) {
  // Default to the requested tier if it's still bookable; otherwise the
  // first non-sold-out package; otherwise nothing. PackageCard already
  // refuses clicks on sold-out cards, but auto-selecting one here would
  // be a confusing "you're booking a sold-out tier" initial state.
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(() => {
    const requested = packages.find((p) => p.tier === defaultPackageTier && !p.soldOut);
    if (requested) return requested.id;
    return packages.find((p) => !p.soldOut)?.id ?? null;
  });
  const [partySize, setPartySize] = useState(4);
  const [eventId, setEventId] = useState(defaultEventId ?? '');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [notes, setNotes] = useState('');

  const selectedPkg = packages.find((p) => p.id === selectedPkgId) ?? null;
  const selectedEvent = events.find((e) => e.id === eventId) ?? null;

  // Inline-built message rather than buildBookingMessage() because the
  // WA-only flow wants to carry optional extras (phone, email, notes)
  // that the DB-backed helper never handled.
  const lines = ['Hi D Global Entertainment 👋'];
  lines.push(
    selectedPkg
      ? `I'd like to book a ${selectedPkg.name} table for ${partySize} ${partySize === 1 ? 'guest' : 'guests'}.`
      : `I'd like to book a VIP table for ${partySize} ${partySize === 1 ? 'guest' : 'guests'}.`,
  );
  if (selectedEvent) {
    lines.push(
      `Event: ${selectedEvent.title} - ${new Date(selectedEvent.startsAt).toDateString()}`,
    );
  }
  if (guestName.trim()) lines.push(`Name: ${guestName.trim()}`);
  if (guestPhone.trim()) lines.push(`Phone: ${guestPhone.trim()}`);
  if (guestEmail.trim()) lines.push(`Email: ${guestEmail.trim()}`);
  if (notes.trim()) lines.push(`Notes: ${notes.trim()}`);
  const waHref = buildWaLink(lines.join('\n'));

  return (
    <div className="space-y-10">
      <div>
        <p className="eyebrow mb-5">1. Choose a package</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              selected={pkg.id === selectedPkgId}
              onClick={() => {
                if (pkg.soldOut) return;
                setSelectedPkgId(pkg.id);
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="eyebrow mb-5">2. Your details</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="guestName">Full name</Label>
            <Input
              id="guestName"
              placeholder="As it should appear on the reservation"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div>
            <Label htmlFor="guestPhone">Phone (WhatsApp)</Label>
            <Input
              id="guestPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+233 XX XXX XXXX"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="guestEmail">Email (optional)</Label>
            <Input
              id="guestEmail"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="partySize">Party size</Label>
            <Input
              id="partySize"
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
            />
          </div>

          <div>
            <Label htmlFor="eventId">Which night?</Label>
            <Select
              id="eventId"
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
              maxLength={500}
              placeholder="Birthdays, bottles, specific requests…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </div>

      {selectedPkg ? (
        <Button asChild variant="primary" size="lg" className="w-full sm:w-auto">
          <a href={waHref} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden className="h-4 w-4" /> Continue on WhatsApp
          </a>
        </Button>
      ) : (
        // Every package is sold out (or none active), submit would
        // open WhatsApp with a generic "VIP table" message and no
        // tier picked, which doesn't help the buyer or the host.
        // Disable instead and surface the constraint inline.
        <div className="rounded-2xl border border-white/10 bg-surface px-5 py-4 text-sm">
          All VIP packages are currently sold out. Message us on WhatsApp anyway and we'll let you
          know if anything frees up.
        </div>
      )}

      <p className="text-xs text-muted">
        We'll confirm your reservation on WhatsApp within an hour. Deposit, bottle selection and
        arrival instructions are handled in-chat.
      </p>
    </div>
  );
}
