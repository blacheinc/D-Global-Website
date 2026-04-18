'use client';

import { useActionState } from 'react';
import type { GalleryImage, GalleryCategory } from '@prisma/client';
import { Input, Label, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { upsertGalleryImage, type GalleryFormState } from '../galleryActions';

const CATEGORIES: GalleryCategory[] = ['EVENTS', 'BACKSTAGE', 'ARTISTS', 'VENUE', 'CAMPAIGN'];

type EventOption = { id: string; title: string };
type Initial = Partial<GalleryImage>;
const initialState: GalleryFormState = { ok: false };

export function GalleryImageForm({
  events,
  initial,
}: {
  events: EventOption[];
  initial?: Initial;
}) {
  const action = upsertGalleryImage.bind(null, initial?.id ?? null);
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
        <Label>Image</Label>
        <ImageUpload
          name="url"
          defaultValue={initial?.url}
          category="gallery"
          required
          ariaInvalid={!!fe.url}
        />
        <FieldError>{fe.url?.[0]}</FieldError>
      </div>

      <div>
        <Label htmlFor="caption">Caption</Label>
        <Input
          id="caption"
          name="caption"
          defaultValue={initial?.caption ?? ''}
          aria-invalid={!!fe.caption}
        />
        <FieldError>{fe.caption?.[0]}</FieldError>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            name="category"
            defaultValue={initial?.category ?? 'EVENTS'}
            className="w-full rounded-xl bg-elevated border border-white/10 px-4 py-3 text-foreground focus:outline-none focus:border-accent"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <FieldError>{fe.category?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="eventId">Link to event (optional)</Label>
          <select
            id="eventId"
            name="eventId"
            defaultValue={initial?.eventId ?? ''}
            className="w-full rounded-xl bg-elevated border border-white/10 px-4 py-3 text-foreground focus:outline-none focus:border-accent"
          >
            <option value="">- none -</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          <FieldError>{fe.eventId?.[0]}</FieldError>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
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
        <div className="flex items-end">
          <label className="inline-flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="featured"
              defaultChecked={initial?.featured ?? false}
              className="h-4 w-4 accent-accent"
            />
            Featured (homepage preview)
          </label>
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : initial?.id ? 'Save changes' : 'Add image'}
        </Button>
      </div>
    </form>
  );
}
