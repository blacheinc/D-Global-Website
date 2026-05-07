'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { MembershipPlan } from '@prisma/client';
import { Input, Label, Textarea, FieldError } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { grantMembership, type GrantMembershipResult } from '../membershipActions';

const initial: GrantMembershipResult | null = null;

export function GrantMembershipForm({
  plans,
}: {
  plans: ReadonlyArray<Pick<MembershipPlan, 'id' | 'name' | 'slug' | 'active'>>;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(grantMembership, initial);
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  const activePlans = plans.filter((p) => p.active);
  if (activePlans.length === 0) {
    return (
      <p className="text-sm text-muted">
        No active plan yet. Create or activate one above before granting memberships.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5 max-w-2xl">
      {state && !state.ok && state.error && (
        <div role="alert" className="rounded-lg border border-accent-hot/40 bg-accent-hot/10 px-4 py-3 text-sm">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div role="status" className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          Membership granted. The recipient gets the discount the next time they sign in.
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="grant-email">Recipient email</Label>
          <Input
            id="grant-email"
            name="email"
            type="email"
            inputMode="email"
            required
            placeholder="member@example.com"
            aria-invalid={!!fe.email}
          />
          <FieldError>{fe.email?.[0]}</FieldError>
        </div>
        <div>
          <Label htmlFor="grant-plan">Plan</Label>
          <Select id="grant-plan" name="planId" required defaultValue={activePlans[0]?.id}>
            {activePlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <FieldError>{fe.planId?.[0]}</FieldError>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="grant-expires">Expires on (optional)</Label>
          <Input
            id="grant-expires"
            name="expiresAt"
            type="date"
            aria-invalid={!!fe.expiresAt}
          />
          <FieldError>{fe.expiresAt?.[0]}</FieldError>
          <p className="mt-1 text-xs text-muted">
            Leave blank to use the plan's billing interval from today.
          </p>
        </div>
        <div>
          <Label htmlFor="grant-note">Internal note (optional)</Label>
          <Textarea
            id="grant-note"
            name="note"
            maxLength={500}
            placeholder="Comp for venue partner, etc."
            rows={3}
            aria-invalid={!!fe.note}
          />
          <FieldError>{fe.note?.[0]}</FieldError>
        </div>
      </div>

      <div className="pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? 'Granting...' : 'Grant membership'}
        </Button>
      </div>
    </form>
  );
}
