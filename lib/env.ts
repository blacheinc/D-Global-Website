import { z } from 'zod';

const DEV_QR_SECRET = 'dev-only-qr-secret-change-me-in-prod';
const DEV_AUTH_SECRET = 'dev-only-auth-secret-change-me-in-prod';
const FALLBACK_SITE_URL = 'http://localhost:3000';
const FALLBACK_WHATSAPP = '233000000000';

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
    AUTH_SECRET: z.string().min(8).default(DEV_AUTH_SECRET),
    // Comma-separated email allowlist. Anyone not on this list who tries
    // to sign in still receives a magic link (we can't tell them apart at
    // request time without leaking which emails are admins), but the
    // resulting session is rejected from /admin routes.
    ADMIN_EMAILS: z.string().default(''),

    // --- Email (Resend) ---
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().email().default('D-Global <noreply@d-global.example>'),

    // --- Analytics (Plausible) ---
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN: z.string().optional(),
    NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL: z
      .string()
      .url()
      .default('https://plausible.io/js/script.js'),

    // --- Error tracking (Sentry) ---
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    SENTRY_DSN: z.string().url().optional(),

    // --- Web push (VAPID) ---
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default('mailto:ops@d-global.example'),
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
  });

const parsed = schema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
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
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
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
