'use client';

import { useActionState } from 'react';
import type { Release, ReleaseKind } from '@prisma/client';
import { Input, Label, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { upsertRelease, type ReleaseFormState } from '../releaseActions';

const KINDS: ReleaseKind[] = ['SINGLE', 'EP', 'ALBUM', 'MIX', 'VIDEO'];

type ArtistOption = { id: string; stageName: string };
type Initial = Partial<Release>;

function toDateInput(d: Date | null | undefined): string {
  if (!d) return '';
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

const initialState: ReleaseFormState = { ok: false };

export function ReleaseForm({
  artists,
  initial,
}: {
  artists: ArtistOption[];
  initial?: Initial;
}) {
  const action = upsertRelease.bind(null, initial?.id ?? null);
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
            placeholder="night-capital"
            aria-invalid={!!fe.slug}
          />
          <FieldError>{fe.slug?.[0]}</FieldError>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="artistId">Artist</Label>
          <select
            id="artistId"
            name="artistId"
            defaultValue={initial?.artistId ?? ''}
            required
            className="w-full rounded-xl bg-elevated border border-white/10 px-4 py-3 text-foreground focus:outline-none focus:border-accent"
          >
            <option value="">- select -</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.stageName}
              </option>
            ))}
          </select>
          <FieldError>{fe.artistId?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="kind">Kind</Label>
          <select
            id="kind"
            name="kind"
            defaultValue={initial?.kind ?? 'SINGLE'}
            className="w-full rounded-xl bg-elevated border border-white/10 px-4 py-3 text-foreground focus:outline-none focus:border-accent"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <FieldError>{fe.kind?.[0]}</FieldError>
        </div>
      </div>

      <div>
        <Label>Cover image</Label>
        <ImageUpload
          name="coverImage"
          defaultValue={initial?.coverImage}
          category="releases"
          required
          ariaInvalid={!!fe.coverImage}
        />
        <FieldError>{fe.coverImage?.[0]}</FieldError>
      </div>

      <div>
        <Label htmlFor="releasedAt">Released on</Label>
        <Input
          type="date"
          id="releasedAt"
          name="releasedAt"
          required
          defaultValue={toDateInput(initial?.releasedAt)}
          aria-invalid={!!fe.releasedAt}
        />
        <FieldError>{fe.releasedAt?.[0]}</FieldError>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <div>
          <Label htmlFor="spotifyUrl">Spotify URL</Label>
          <Input
            type="url"
            id="spotifyUrl"
            name="spotifyUrl"
            defaultValue={initial?.spotifyUrl ?? ''}
            aria-invalid={!!fe.spotifyUrl}
          />
          <FieldError>{fe.spotifyUrl?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="audiomackUrl">Audiomack URL</Label>
          <Input
            type="url"
            id="audiomackUrl"
            name="audiomackUrl"
            defaultValue={initial?.audiomackUrl ?? ''}
            aria-invalid={!!fe.audiomackUrl}
          />
          <FieldError>{fe.audiomackUrl?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="youtubeUrl">YouTube URL</Label>
          <Input
            type="url"
            id="youtubeUrl"
            name="youtubeUrl"
            defaultValue={initial?.youtubeUrl ?? ''}
            aria-invalid={!!fe.youtubeUrl}
          />
          <FieldError>{fe.youtubeUrl?.[0]}</FieldError>
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : initial?.id ? 'Save changes' : 'Create release'}
        </Button>
      </div>
    </form>
  );
}
