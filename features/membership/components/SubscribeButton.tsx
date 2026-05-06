'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { subscribeMembership, type SubscribeMembershipResult } from '../actions';

const initial: SubscribeMembershipResult | null = null;

// Single-purpose form: hidden input carries the plan slug, submit fires
// the action which either redirects to Paystack (success path, throws)
// or returns a string error rendered inline. useActionState gives us
// the pending state for the button label without a separate
// useTransition.

export function SubscribeButton({
  planSlug,
  label,
  className,
}: {
  planSlug: string;
  label: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(subscribeMembership, initial);
  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="planSlug" value={planSlug} />
      <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full sm:w-auto">
        {pending ? 'Redirecting to Paystack...' : label}
      </Button>
      {state && !state.ok && (
        <p role="alert" className="mt-3 text-xs text-accent-hot">
          {state.error}
        </p>
      )}
    </form>
  );
}
