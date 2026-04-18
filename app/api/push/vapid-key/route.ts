import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Read-only endpoint that hands the VAPID public key to the service
// worker so it can re-subscribe on `pushsubscriptionchange`. The SW
// context has no access to window.__NEXT_PUBLIC_* / process.env, so it
// has to fetch this over HTTP. The key is genuinely public (that's the
// whole point of VAPID, browsers use it to verify the server's
// identity during subscribe); there's no auth gate here.
//
// 204 when unconfigured, the SW already guards on `!key` and skips
// re-subscribe gracefully. Returning an empty 200 would also work but
// 204 is the clearer signal.

export async function GET() {
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json({ key: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY });
}
