import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { bookingSchema } from '@/features/bookings/schema';

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
    return NextResponse.json(
      {
        error: 'Please check your details and try again.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const pkg = await db.package.findUnique({
      where: { tier: parsed.data.packageTier },
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
  } catch (err) {
    console.error('[api/bookings] DB error:', err);
    return NextResponse.json(
      { error: "Something went wrong on our side. Try again, or message us on WhatsApp." },
      { status: 500 },
    );
  }
}
