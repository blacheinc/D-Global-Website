import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { bookingSchema } from '@/features/bookings/schema';
import { PackageTier } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const pkg = await db.package.findUnique({
    where: { tier: parsed.data.packageTier as PackageTier },
  });
  if (!pkg) return NextResponse.json({ error: 'Unknown package' }, { status: 404 });

  const booking = await db.booking.create({
    data: {
      packageId: pkg.id,
      eventId: parsed.data.eventId || null,
      guestName: parsed.data.guestName,
      guestPhone: parsed.data.guestPhone,
      guestEmail: parsed.data.guestEmail || null,
      partySize: parsed.data.partySize,
      notes: parsed.data.notes || null,
    },
    select: { id: true, code: true },
  });

  return NextResponse.json({ ok: true, booking }, { status: 201 });
}
