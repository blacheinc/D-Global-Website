import { z } from 'zod';
import { isStrictEmail } from '@/lib/email';

export const checkoutSchema = z.object({
  eventId: z.string().min(1),
  items: z
    .array(
      z.object({
        ticketTypeId: z.string().min(1),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1),
  buyer: z.object({
    name: z.string().trim().min(2),
    // Normalise the address at the schema boundary, then apply our
    // stricter validator (rejects what Zod's .email() passes but
    // Paystack rejects: short TLDs, consecutive dots, unicode, stray
    // whitespace). Keeps bad emails from wasting a Paystack round-trip
    // and lets the checkout form surface a clean field error.
    email: z
      .string()
      .trim()
      .toLowerCase()
      .refine(isStrictEmail, { message: 'Enter a valid email address.' }),
    phone: z.string().trim().regex(/^\+?\d{8,15}$/, 'Enter a valid phone number'),
  }),
});

export type CheckoutPayload = z.infer<typeof checkoutSchema>;
