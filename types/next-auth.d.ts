import type { Role } from '@prisma/client';
import type { DefaultSession } from 'next-auth';

// Augments the default NextAuth session shape so RSCs reading
// `session.user.role` get a proper enum back instead of `unknown`.
// Mirrors what auth.ts session callback assigns.
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession['user'];
  }
}
