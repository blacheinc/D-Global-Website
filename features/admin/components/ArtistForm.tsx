'use client';

import { useActionState } from 'react';
import type { Artist } from '@prisma/client';
import { Input, Label, Textarea, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { upsertArtist, type ArtistFormState } from '../artistActions';

type Initial = Partial<Artist>;

const initialState: ArtistFormState = { ok: false };

export function ArtistForm({ initial }: { initial?: Initial }) {
  const action = upsertArtist.bind(null, initial?.id ?? null);
  const [state, formAction, pending] = useActionState(action, initialState);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6 max-w-2xl">
      {state.error && (
        <div role="alert" className="rounded-lg border border-accent-hot/40 bg-accent-hot/10 px-4 py-3 text-sm">
          {state.error}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="stageName">Stage name</Label>
          <Input
            id="stageName"
            name="stageName"
            defaultValue={initial?.stageName}
            required
            aria-invalid={!!fe.stageName}
          />
          <FieldError>{fe.stageName?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            name="slug"
            defaultValue={initial?.slug}
            required
            placeholder="kwesi-nyame"
            aria-invalid={!!fe.slug}
          />
          <FieldError>{fe.slug?.[0]}</FieldError>
        </div>
      </div>

      <div>
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" name="bio" defaultValue={initial?.bio ?? ''} aria-invalid={!!fe.bio} />
        <FieldError>{fe.bio?.[0]}</FieldError>
      </div>

      <div>
        <Label>Avatar</Label>
        <ImageUpload
          name="avatar"
          defaultValue={initial?.avatar}
          category="artists"
          ariaInvalid={!!fe.avatar}
        />
        <FieldError>{fe.avatar?.[0]}</FieldError>
      </div>

      <div>
        <Label>Hero image</Label>
        <ImageUpload
          name="heroImage"
          defaultValue={initial?.heroImage}
          category="artists"
          ariaInvalid={!!fe.heroImage}
        />
        <FieldError>{fe.heroImage?.[0]}</FieldError>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="spotifyId">Spotify artist ID</Label>
          <Input
            id="spotifyId"
            name="spotifyId"
            defaultValue={initial?.spotifyId ?? ''}
            placeholder="1Xyo4u8uXC1ZmMpatF05PJ"
            aria-invalid={!!fe.spotifyId}
          />
          <FieldError>{fe.spotifyId?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="audiomackId">Audiomack handle</Label>
          <Input
            id="audiomackId"
            name="audiomackId"
            defaultValue={initial?.audiomackId ?? ''}
            placeholder="sarkodie"
            aria-invalid={!!fe.audiomackId}
          />
          <FieldError>{fe.audiomackId?.[0]}</FieldError>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="instagram">Instagram URL</Label>
          <Input
            type="url"
            id="instagram"
            name="instagram"
            defaultValue={initial?.instagram ?? ''}
            aria-invalid={!!fe.instagram}
          />
          <FieldError>{fe.instagram?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="twitter">Twitter/X URL</Label>
          <Input
            type="url"
            id="twitter"
            name="twitter"
            defaultValue={initial?.twitter ?? ''}
            aria-invalid={!!fe.twitter}
          />
          <FieldError>{fe.twitter?.[0]}</FieldError>
        </div>
      </div>

      <div className="flex items-center">
        <label className="inline-flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="featured"
            defaultChecked={initial?.featured ?? false}
            className="h-4 w-4 accent-accent"
          />
          Featured in the homepage artist carousel
        </label>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : initial?.id ? 'Save changes' : 'Create artist'}
        </Button>
      </div>
    </form>
  );
}
