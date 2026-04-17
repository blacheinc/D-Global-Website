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
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
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
