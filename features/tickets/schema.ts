import { z } from 'zod';

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
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().regex(/^\+?\d{8,15}$/, 'Enter a valid phone number'),
  }),
});

export type CheckoutPayload = z.infer<typeof checkoutSchema>;
