// NextAuth v5 catch-all handler. Re-exports the GET/POST handlers from
// the root `auth.ts` config. Don't put any logic here, the config is
// authoritative and this file should stay a thin re-export.
import { handlers } from '@/auth';

export const { GET, POST } = handlers;

// Auth.js sets its own cache headers; force-dynamic prevents Next from
// caching unauthenticated responses for /api/auth/session.
export const dynamic = 'force-dynamic';
