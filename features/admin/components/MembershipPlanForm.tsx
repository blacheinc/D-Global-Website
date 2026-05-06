'use client';

import { useActionState } from 'react';
import type { MembershipPlan } from '@prisma/client';
import { Input, Label, Textarea, FieldError } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import {
  upsertMembershipPlan,
  type MembershipPlanFormState,
} from '../membershipActions';

const initial: MembershipPlanFormState = { ok: false };

export function MembershipPlanForm({ plan }: { plan: MembershipPlan | null }) {
  const action = upsertMembershipPlan.bind(null, plan?.id ?? null);
  const [state, formAction, pending] = useActionState(action, initial);
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
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            name="slug"
            defaultValue={plan?.slug ?? 'members'}
            placeholder="members"
            required
            aria-invalid={!!fe.slug}
          />
          <FieldError>{fe.slug?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="name">Display name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={plan?.name}
            placeholder="D Global Members"
            required
            aria-invalid={!!fe.name}
          />
          <FieldError>{fe.name?.[0]}</FieldError>
        </div>
      </div>

      <div>
        <Label htmlFor="tagline">Tagline</Label>
        <Input
          id="tagline"
          name="tagline"
          defaultValue={plan?.tagline ?? ''}
          placeholder="Your seat at every drop, 20% off the door."
          aria-invalid={!!fe.tagline}
        />
        <FieldError>{fe.tagline?.[0]}</FieldError>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={plan?.description ?? ''}
          placeholder="What members get, beyond the discount."
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
            // Same pesewa->GHS shift as TicketTypeForm.
            defaultValue={plan?.priceMinor != null ? plan.priceMinor / 100 : ''}
            aria-invalid={!!fe.priceMinor}
          />
          <FieldError>{fe.priceMinor?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="intervalDays">Billing every (days)</Label>
          <Input
            type="number"
            min={1}
            max={366}
            id="intervalDays"
            name="intervalDays"
            required
            defaultValue={plan?.intervalDays ?? 30}
            aria-invalid={!!fe.intervalDays}
          />
          <FieldError>{fe.intervalDays?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="discountPercent">Discount (%)</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.5"
            min={0}
            max={100}
            id="discountPercent"
            name="discountPercent"
            required
            // Bps -> percent for the form value, persisted back as bps
            // by the action's preprocess.
            defaultValue={plan?.discountBps != null ? plan.discountBps / 100 : 20}
            aria-invalid={!!fe.discountPercent}
          />
          <FieldError>{fe.discountPercent?.[0]}</FieldError>
        </div>
      </div>

      <div>
        <Label htmlFor="perks">Perks (one per line)</Label>
        <Textarea
          id="perks"
          name="perks"
          defaultValue={plan?.perks?.join('\n') ?? ''}
          placeholder={'20% off every ticket\n20% off VIP table deposits\nFirst dibs on drop announcements'}
          aria-invalid={!!fe.perks}
        />
        <FieldError>{fe.perks?.[0]}</FieldError>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            name="currency"
            defaultValue={plan?.currency ?? 'GHS'}
            maxLength={3}
            required
            aria-invalid={!!fe.currency}
          />
          <FieldError>{fe.currency?.[0]}</FieldError>
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={plan?.active ?? true}
              className="h-4 w-4 accent-accent"
            />
            Active (members keep the discount; signups continue)
          </label>
        </div>
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving...' : plan ? 'Save plan' : 'Create plan'}
        </Button>
      </div>
    </form>
  );
}
