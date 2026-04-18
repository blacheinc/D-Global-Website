import { z } from 'zod';

const DEV_QR_SECRET = 'dev-only-qr-secret-change-me-in-prod';
const DEV_AUTH_SECRET = 'dev-only-auth-secret-change-me-in-prod';
const FALLBACK_SITE_URL = 'http://localhost:3000';
const FALLBACK_WHATSAPP = '233000000000';
const FALLBACK_EMAIL_FROM = 'D-Global <noreply@d-global.example>';

const schema = z
  .object({
    DATABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SITE_URL: z.string().url().default(FALLBACK_SITE_URL),
    // Default is an obviously-fake all-zeroes number so a missing env var
    // produces visibly-broken WhatsApp links instead of silently sending
    // booking inquiries to a real stranger's phone.
    NEXT_PUBLIC_WHATSAPP_NUMBER: z
      .string()
      .regex(/^\d{8,15}$/, 'WhatsApp number must be digits only, E.164 without +')
      .default(FALLBACK_WHATSAPP),
    PAYSTACK_MODE: z.enum(['link', 'api']).default('link'),
    PAYSTACK_SECRET_KEY: z.string().optional(),
    QR_SECRET: z.string().min(8).default(DEV_QR_SECRET),

    // --- Auth (NextAuth) ---
    // 32 chars minimum matches NextAuth v5's guidance — it's the secret
    // that signs session cookies, and 8 chars is trivially brute-forceable
    // offline against an intercepted cookie. .env.example already tells
    // operators to generate via `openssl rand -base64 32` (44 chars after
    // encoding) so the tighter minimum doesn't break the happy path.
    AUTH_SECRET: z.string().min(32).default(DEV_AUTH_SECRET),
    // Comma-separated email allowlist. Anyone not on this list who tries
    // to sign in still receives a magic link (we can't tell them apart at
    // request time without leaking which emails are admins), but the
    // resulting session is rejected from /admin routes.
    ADMIN_EMAILS: z.string().default(''),

    // --- Email (Resend) ---
    RESEND_API_KEY: z.string().optional(),
    // Not z.string().email() — From values use the RFC 5322 address-spec
    // format ("Display Name <user@host>") which zod's email regex rejects.
    // Resend validates the shape at send time; min(1) is enough here to
    // catch an empty env.
    EMAIL_FROM: z.string().min(1).default(FALLBACK_EMAIL_FROM),

    // --- Analytics (Plausible) ---
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN: z.string().optional(),
    NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL: z
      .string()
      .url()
      .default('https://plausible.io/js/script.js'),

    // --- Error tracking (Sentry) ---
    // DSN and environment are read at runtime by the Sentry SDK config
    // files (sentry.{client,server,edge}.config.ts). Release is NOT
    // listed here because it's build-time only — the Sentry webpack
    // plugin auto-injects it into Sentry.init calls.
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    SENTRY_DSN: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),

    // --- Web push (VAPID) ---
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default('mailto:ops@d-global.example'),

    // --- Storage (Cloudflare R2) ---
    // R2 is S3-compatible. Account ID is the tenant; access keys are the IAM
    // credentials; bucket is the container; public URL is the CDN domain
    // (either a custom domain bound to the bucket or pub-xxx.r2.dev).
    // Uploads go through /api/admin/upload which is admin-only.
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    R2_PUBLIC_URL: z.string().url().optional(),
  })
  // Cross-field validation that applies in any environment: if
  // PAYSTACK_MODE=api is selected, the secret key must be set or every
  // checkout request will 502 at runtime. Better to fail startup so the
  // operator catches it before any user clicks "Pay with Paystack".
  //
  // Like the production refine below, this is server-only so the client
  // bundle (which never sees PAYSTACK_SECRET_KEY) doesn't crash.
  .superRefine((val, ctx) => {
    if (typeof window !== 'undefined') return;
    if (val.PAYSTACK_MODE === 'api' && !val.PAYSTACK_SECRET_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYSTACK_SECRET_KEY'],
        message: 'PAYSTACK_SECRET_KEY is required when PAYSTACK_MODE=api.',
      });
    }
    // Web push needs both keys or neither — half-configured is a runtime
    // foot-gun. This check is server-only because VAPID_PRIVATE_KEY is
    // never bundled to the client (no NEXT_PUBLIC_ prefix), so on the
    // browser it's always undefined while the public key is set, which
    // would otherwise always fail validation and crash the app.
    const hasPushPub = !!val.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const hasPushPriv = !!val.VAPID_PRIVATE_KEY;
    if (hasPushPub !== hasPushPriv) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['VAPID_PRIVATE_KEY'],
        message: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must both be set, or neither.',
      });
    }
    // R2 config is all-or-nothing. Partial config would let admin upload
    // buttons render but crash at upload time with an opaque AWS SDK error.
    const r2Fields = [
      val.R2_ACCOUNT_ID,
      val.R2_ACCESS_KEY_ID,
      val.R2_SECRET_ACCESS_KEY,
      val.R2_BUCKET,
      val.R2_PUBLIC_URL,
    ];
    const r2Set = r2Fields.filter(Boolean).length;
    if (r2Set > 0 && r2Set < r2Fields.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['R2_BUCKET'],
        message:
          'R2_* env vars must all be set, or none. Missing one breaks uploads at runtime.',
      });
    }
  })
  // Production safety net: refuse to start if any of the placeholder dev
  // defaults survived into a production build. The QR check in particular
  // is security-critical — the dev secret is in source, so tickets signed
  // with it could be forged by anyone reading the repo.
  //
  // Server-only: env.ts is bundled into the client too (via lib/whatsapp →
  // env). On the client, non-NEXT_PUBLIC vars are always undefined → defaults
  // always kick in → this refine would always fail → the client throw would
  // crash the entire app. The window check skips the refine in the browser.
  .superRefine((val, ctx) => {
    if (typeof window !== 'undefined') return;
    if (process.env.NODE_ENV !== 'production') return;
    if (val.QR_SECRET === DEV_QR_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['QR_SECRET'],
        message: 'QR_SECRET must be set to a real secret in production.',
      });
    }
    if (val.AUTH_SECRET === DEV_AUTH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_SECRET'],
        message: 'AUTH_SECRET must be set to a real secret in production.',
      });
    }
    if (val.NEXT_PUBLIC_SITE_URL === FALLBACK_SITE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['NEXT_PUBLIC_SITE_URL'],
        message: 'NEXT_PUBLIC_SITE_URL must be set in production.',
      });
    }
    if (val.NEXT_PUBLIC_WHATSAPP_NUMBER === FALLBACK_WHATSAPP) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['NEXT_PUBLIC_WHATSAPP_NUMBER'],
        message: 'NEXT_PUBLIC_WHATSAPP_NUMBER must be set in production.',
      });
    }
    // Without RESEND_API_KEY in prod, every transactional email (magic-link
    // sign-in, order confirmation) silently drops. Fail startup instead of
    // shipping a deploy where sign-in looks like it worked but nobody ever
    // gets the email. Intentional "no email" deploys should override this
    // check at the deploy layer, not by leaving the key blank.
    if (!val.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY must be set in production.',
      });
    }
    if (val.EMAIL_FROM === FALLBACK_EMAIL_FROM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EMAIL_FROM'],
        message:
          'EMAIL_FROM must be set in production to a verified sender on your Resend domain.',
      });
    }
  });

// Tolerant resolver for NEXT_PUBLIC_SITE_URL:
//   1. If it's set with a scheme, use it.
//   2. If it's set as a bare hostname (a pitfall when pasting a Vercel
//      URL from the dashboard), prepend https://.
//   3. If it's unset and we're building on Vercel, fall back to the
//      per-deployment VERCEL_URL that Vercel auto-populates — this is
//      also schemeless, so normalize the same way. Previews and
//      production deploys both build without an explicit env var.
// Returning undefined lets the zod .default(FALLBACK_SITE_URL) fire in
// dev, and the production refine below catches a still-missing value.
function resolveSiteUrl(raw: string | undefined): string | undefined {
  const candidate = raw || process.env.VERCEL_URL;
  if (!candidate) return undefined;
  return /^https?:\/\//.test(candidate) ? candidate : `https://${candidate}`;
}

const parsed = schema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_SITE_URL: resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  NEXT_PUBLIC_WHATSAPP_NUMBER: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
  PAYSTACK_MODE: process.env.PAYSTACK_MODE,
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
  QR_SECRET: process.env.QR_SECRET,
  AUTH_SECRET: process.env.AUTH_SECRET,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
  NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL: process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  SENTRY_DSN: process.env.SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET: process.env.R2_BUCKET,
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
});

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration. See .env.example.');
}

export const env = parsed.data;

// Parsed admin email list. Lower-cased + trimmed for case-insensitive
// comparison against NextAuth's normalized email. Exposed as a Set for
// O(1) lookup in the auth callback.
export const adminEmails: ReadonlySet<string> = new Set(
  env.ADMIN_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);
