'use client';

import { useActionState } from 'react';
import { Input, Label, Textarea, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { upsertEvent, type EventFormState } from '../eventActions';

type EventInitial = {
  id?: string;
  slug?: string;
  title?: string;
  subtitle?: string | null;
  description?: string;
  startsAt?: Date;
  endsAt?: Date | null;
  doorsAt?: Date | null;
  venueName?: string;
  venueCity?: string;
  venueAddress?: string | null;
  venueMapUrl?: string | null;
  heroImage?: string;
  genre?: string[];
  status?: 'DRAFT' | 'PUBLISHED' | 'SOLD_OUT' | 'CANCELLED';
  featured?: boolean;
};

const initialState: EventFormState = { ok: false };

function toLocalInput(d: Date | null | undefined): string {
  if (!d) return '';
  // datetime-local expects YYYY-MM-DDTHH:mm in *local* time. toISOString
  // returns UTC; subtract the tz offset before slicing or you'll see a
  // 6-hour drift in Accra (UTC+0) when the host runs in another zone.
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export function EventForm({ initial }: { initial?: EventInitial }) {
  const action = upsertEvent.bind(null, initial?.id ?? null);
  const [state, formAction, pending] = useActionState(action, initialState);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6 max-w-2xl">
      {state.error && (
        <div role="alert" className="rounded-lg border border-accent-hot/40 bg-accent-hot/10 px-4 py-3 text-sm">
          {state.error}
        </div>
      )}

      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={initial?.title} required aria-invalid={!!fe.title} />
        <FieldError>{fe.title?.[0]}</FieldError>
      </div>

      <div>
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          name="slug"
          defaultValue={initial?.slug}
          required
          aria-invalid={!!fe.slug}
          placeholder="accra-labs-vol-08"
        />
        <FieldError>{fe.slug?.[0]}</FieldError>
      </div>

      <div>
        <Label htmlFor="subtitle">Subtitle</Label>
        <Input id="subtitle" name="subtitle" defaultValue={initial?.subtitle ?? ''} aria-invalid={!!fe.subtitle} />
        <FieldError>{fe.subtitle?.[0]}</FieldError>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={initial?.description}
          required
          aria-invalid={!!fe.description}
        />
        <FieldError>{fe.description?.[0]}</FieldError>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <div>
          <Label htmlFor="startsAt">Starts at</Label>
          <Input
            type="datetime-local"
            id="startsAt"
            name="startsAt"
            required
            defaultValue={toLocalInput(initial?.startsAt)}
            aria-invalid={!!fe.startsAt}
          />
          <FieldError>{fe.startsAt?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="doorsAt">Doors at</Label>
          <Input
            type="datetime-local"
            id="doorsAt"
            name="doorsAt"
            defaultValue={toLocalInput(initial?.doorsAt)}
          />
        </div>
        <div>
          <Label htmlFor="endsAt">Ends at</Label>
          <Input
            type="datetime-local"
            id="endsAt"
            name="endsAt"
            defaultValue={toLocalInput(initial?.endsAt)}
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="venueName">Venue name</Label>
          <Input id="venueName" name="venueName" defaultValue={initial?.venueName} required aria-invalid={!!fe.venueName} />
          <FieldError>{fe.venueName?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="venueCity">Venue city</Label>
          <Input id="venueCity" name="venueCity" defaultValue={initial?.venueCity ?? 'Accra'} required />
        </div>
      </div>

      <div>
        <Label htmlFor="venueAddress">Venue address</Label>
        <Input id="venueAddress" name="venueAddress" defaultValue={initial?.venueAddress ?? ''} />
      </div>

      <div>
        <Label htmlFor="venueMapUrl">Map URL</Label>
        <Input
          type="url"
          id="venueMapUrl"
          name="venueMapUrl"
          defaultValue={initial?.venueMapUrl ?? ''}
          aria-invalid={!!fe.venueMapUrl}
        />
        <FieldError>{fe.venueMapUrl?.[0]}</FieldError>
      </div>

      <div>
        <Label htmlFor="heroImage">Hero image URL</Label>
        <Input id="heroImage" name="heroImage" defaultValue={initial?.heroImage} required aria-invalid={!!fe.heroImage} />
        <FieldError>{fe.heroImage?.[0]}</FieldError>
      </div>

      <div>
        <Label htmlFor="genre">Genres (comma-separated)</Label>
        <Input id="genre" name="genre" defaultValue={initial?.genre?.join(', ') ?? ''} placeholder="afrobeats, amapiano" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={initial?.status ?? 'DRAFT'}
            className="w-full rounded-xl bg-elevated border border-white/10 px-4 py-3 text-foreground focus:outline-none focus:border-accent"
          >
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="SOLD_OUT">Sold out</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="featured"
              defaultChecked={initial?.featured ?? false}
              className="h-4 w-4 accent-accent"
            />
            Featured on homepage
          </label>
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : initial?.id ? 'Save changes' : 'Create event'}
        </Button>
      </div>
    </form>
  );
}
