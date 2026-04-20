'use client';

import { useActionState } from 'react';
import type { Package, PackageTier } from '@prisma/client';
import { Input, Label, Textarea, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { upsertPackage, type PackageFormState } from '../packageActions';

const TIERS: PackageTier[] = ['SILVER', 'GOLD', 'PLATINUM'];
type Initial = Partial<Package>;
const initialState: PackageFormState = { ok: false };

export function PackageForm({ initial }: { initial?: Initial }) {
  const action = upsertPackage.bind(null, initial?.id ?? null);
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
          <Label htmlFor="tier">Tier</Label>
          <select
            id="tier"
            name="tier"
            defaultValue={initial?.tier ?? 'SILVER'}
            className="w-full rounded-xl bg-elevated border border-white/10 px-4 py-3 text-foreground focus:outline-none focus:border-accent"
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <FieldError>{fe.tier?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="name">Display name</Label>
          <Input id="name" name="name" defaultValue={initial?.name} required aria-invalid={!!fe.name} />
          <FieldError>{fe.name?.[0]}</FieldError>
        </div>
      </div>

      <div>
        <Label htmlFor="tagline">Tagline</Label>
        <Input
          id="tagline"
          name="tagline"
          defaultValue={initial?.tagline ?? ''}
          placeholder="For groups who want the corner"
          aria-invalid={!!fe.tagline}
        />
        <FieldError>{fe.tagline?.[0]}</FieldError>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={initial?.description ?? ''}
          aria-invalid={!!fe.description}
        />
        <FieldError>{fe.description?.[0]}</FieldError>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <div>
          <Label htmlFor="priceMinor">Price (GHS)</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            id="priceMinor"
            name="priceMinor"
            required
            // Same pesewa→GHS shift as TicketTypeForm: admin types the
            // amount in the currency customers see; the action rounds
            // it back to pesewas before Prisma write.
            defaultValue={initial?.priceMinor != null ? initial.priceMinor / 100 : ''}
            aria-invalid={!!fe.priceMinor}
          />
          <FieldError>{fe.priceMinor?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            name="currency"
            defaultValue={initial?.currency ?? 'GHS'}
            maxLength={3}
            required
            aria-invalid={!!fe.currency}
          />
          <FieldError>{fe.currency?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="maxGuests">Max guests</Label>
          <Input
            type="number"
            min={1}
            id="maxGuests"
            name="maxGuests"
            required
            defaultValue={initial?.maxGuests ?? ''}
            aria-invalid={!!fe.maxGuests}
          />
          <FieldError>{fe.maxGuests?.[0]}</FieldError>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="bottlesIncl">Bottles included</Label>
          <Input
            type="number"
            min={0}
            id="bottlesIncl"
            name="bottlesIncl"
            defaultValue={initial?.bottlesIncl ?? 0}
            required
            aria-invalid={!!fe.bottlesIncl}
          />
          <FieldError>{fe.bottlesIncl?.[0]}</FieldError>
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={initial?.active ?? true}
              className="h-4 w-4 accent-accent"
            />
            Active (visible on /bookings)
          </label>
        </div>
      </div>

      <div>
        <Label htmlFor="perks">Perks (one per line)</Label>
        <Textarea
          id="perks"
          name="perks"
          defaultValue={initial?.perks?.join('\n') ?? ''}
          placeholder={'Private bottle service\nPriority entry\nDedicated host'}
          aria-invalid={!!fe.perks}
        />
        <FieldError>{fe.perks?.[0]}</FieldError>
      </div>

      <div>
        <Label>Hero image (optional)</Label>
        <ImageUpload
          name="heroImage"
          defaultValue={initial?.heroImage}
          category="packages"
          ariaInvalid={!!fe.heroImage}
        />
        <FieldError>{fe.heroImage?.[0]}</FieldError>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : initial?.id ? 'Save changes' : 'Create package'}
        </Button>
      </div>
    </form>
  );
}
