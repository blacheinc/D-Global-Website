import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_WHATSAPP_NUMBER: z
    .string()
    .regex(/^\d{8,15}$/, 'WhatsApp number must be digits only, E.164 without +')
    .default('233241234567'),
  PAYSTACK_MODE: z.enum(['link', 'api']).default('link'),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: z.string().optional(),
  QR_SECRET: z.string().min(8).default('dev-only-qr-secret-change-me-in-prod'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
});

const parsed = schema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_WHATSAPP_NUMBER: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
  PAYSTACK_MODE: process.env.PAYSTACK_MODE,
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
  NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
  QR_SECRET: process.env.QR_SECRET,
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
});

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration. See .env.example.');
}

export const env = parsed.data;
