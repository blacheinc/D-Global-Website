import { z } from 'zod';
import { PackageTier } from '@prisma/client';

export const bookingSchema = z.object({
  packageTier: z.nativeEnum(PackageTier),
  eventId: z.string().optional().nullable(),
  guestName: z.string().min(2, 'Name is too short'),
  guestPhone: z
    .string()
    .regex(/^\+?\d{8,15}$/, 'Enter a valid phone number'),
  guestEmail: z.string().email().optional().or(z.literal('')),
  partySize: z.coerce.number().int().min(1).max(30),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export type BookingPayload = z.infer<typeof bookingSchema>;
