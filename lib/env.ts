import { z } from 'zod';

const DEV_QR_SECRET = 'dev-only-qr-secret-change-me-in-prod';
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
});

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration. See .env.example.');
}

export const env = parsed.data;
