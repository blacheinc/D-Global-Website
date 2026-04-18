import 'server-only';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

// Server helpers built on top of the NextAuth v5 `auth()` accessor. Use
// these from RSCs, Route Handlers, and Server Actions. The unstable name
// `auth()` is the official Auth.js v5 API — don't be tempted to rename
// it via re-export.

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

// Throws into a redirect response (Next handles the redirect cleanly when
// it's thrown from an RSC or Server Action). Callsite reads as a guard:
//
//   const user = await requireAdmin();
//
// — anything after the call has already been authorized.
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect('/api/auth/signin?callbackUrl=/admin');
  if (user.role !== 'ADMIN') redirect('/');
  return user;
}
