import 'server-only';
import { env } from '@/lib/env';

const BASE = 'https://api.paystack.co';

type PaystackResponse<T> = {
  status: boolean;
  message: string;
  data: T;
};

async function paystackFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<PaystackResponse<T>> {
  const secret = env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new Error('PAYSTACK_SECRET_KEY is not set. Either configure it or use PAYSTACK_MODE=link.');
  }
  // 15s timeout caps the longest a checkout request can hang waiting on
  // Paystack. Without this, a Paystack outage leaves Node connections open
  // until the host-level timeout (Vercel hobby = 10s; self-hosted = none).
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as PaystackResponse<T>;
  if (!res.ok || !json.status) {
    throw new Error(`Paystack ${path} failed: ${json.message}`);
  }
  return json;
}

export type InitializeArgs = {
  email: string;
  amountMinor: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  currency?: string;
  // When set, Paystack creates a subscription against this plan after
  // the first successful charge. Subsequent renewals fire their own
  // charge.success events without us round-tripping. The amount sent
  // here is ignored for subscription creates, Paystack uses the plan's
  // configured amount, but we still pass it so the SDK doesn't reject
  // a missing field.
  planCode?: string;
};

export async function initializeTransaction(args: InitializeArgs) {
  return paystackFetch<{ authorization_url: string; access_code: string; reference: string }>(
    '/transaction/initialize',
    {
      method: 'POST',
      body: JSON.stringify({
        email: args.email,
        amount: args.amountMinor,
        reference: args.reference,
        currency: args.currency ?? 'GHS',
        callback_url: args.callbackUrl,
        metadata: args.metadata,
        ...(args.planCode ? { plan: args.planCode } : {}),
      }),
    },
  );
}

export async function verifyTransaction(reference: string) {
  return paystackFetch<{ status: string; amount: number; customer: { email: string } }>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: 'GET' },
  );
}

// Subscription plans live on Paystack's side as named billing schedules.
// Our MembershipPlan stores the plan_code returned here so we can pass
// it to /transaction/initialize when a member signs up. Created lazily
// on first signup rather than at admin-save time so an admin tweaking
// the price doesn't accidentally orphan an old plan_code mid-flight.
export type CreatePaystackPlanArgs = {
  name: string;
  amountMinor: number;
  // Paystack accepts named intervals: hourly, daily, weekly, monthly,
  // biannually, annually. We map our intervalDays to the closest one.
  interval: 'monthly' | 'biannually' | 'annually' | 'weekly' | 'daily';
  currency?: string;
};

export async function createPaystackPlan(args: CreatePaystackPlanArgs) {
  return paystackFetch<{ id: number; plan_code: string; name: string }>('/plan', {
    method: 'POST',
    body: JSON.stringify({
      name: args.name,
      amount: args.amountMinor,
      interval: args.interval,
      currency: args.currency ?? 'GHS',
    }),
  });
}

// Disable a live subscription. Paystack stops auto-renewing; the member
// keeps their current period (we mirror that locally via
// status: CANCELLED + currentPeriodEnd unchanged). Both code AND
// email_token are required, the email_token is what proves the caller
// owns the subscription, since subscription_code alone is enough to
// look one up but not to mutate it.
export async function disablePaystackSubscription(args: {
  code: string;
  token: string;
}) {
  return paystackFetch<{ status: boolean }>('/subscription/disable', {
    method: 'POST',
    body: JSON.stringify({ code: args.code, token: args.token }),
  });
}
