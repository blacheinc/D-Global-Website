import 'server-only';

// NextAuth stub — wired when admin dashboard ships.
export async function getCurrentUser(): Promise<null> {
  return null;
}

export async function requireAdmin(): Promise<never> {
  throw new Error('Admin auth not yet configured. Add NextAuth in a follow-up milestone.');
}
