import NextAuth from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { db } from '@/server/db';
import { env, adminEmails } from '@/lib/env';
import { sendMagicLink } from '@/server/email/magicLink';

// NextAuth v5 (Auth.js) config. Magic-link only — no passwords, no OAuth.
// The Nodemailer provider is the contract Auth.js exposes for email-based
// flows; we ignore its server config and ship the verification request
// through our own Resend-backed mailer.
//
// Why no `pages.signIn` override: the default `/api/auth/signin` page is
// fine for staff. If we ever expose sign-in to end users (e.g. ticket
// reservation accounts), build a branded `/signin` page and set it here.
//
// Why no `session.strategy = 'jwt'`: the PrismaAdapter writes Session
// rows, and the default strategy ('database') is correct for that. JWT
// would skip the DB on every request but means we couldn't revoke
// sessions server-side — a bad trade for an admin surface.

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  secret: env.AUTH_SECRET,
  trustHost: true,
  providers: [
    Nodemailer({
      // The `server` config is required by Auth.js's type but unused by
      // us — sendVerificationRequest takes over the actual transport.
      server: { host: 'unused', port: 0, auth: { user: 'unused', pass: 'unused' } },
      from: env.EMAIL_FROM,
      async sendVerificationRequest({ identifier, url }) {
        await sendMagicLink({ to: identifier, url });
      },
    }),
  ],
  callbacks: {
    // Promote allowlisted emails to ADMIN on first sign-in. Subsequent
    // sign-ins re-check (in case ADMIN_EMAILS has been tightened) and
    // demote anyone who's no longer allowlisted back to GUEST. The
    // adapter has already created the User row by this point.
    async signIn({ user }) {
      if (!user.email) return false;
      const isAdmin = adminEmails.has(user.email.toLowerCase());
      try {
        await db.user.update({
          where: { email: user.email },
          data: { role: isAdmin ? 'ADMIN' : 'GUEST' },
        });
      } catch {
        // First-ever sign-in: the adapter creates the User after
        // signIn returns true, so update can fail. The session
        // callback re-reads the role on every request, so the role
        // gets set on the next sign-in (or via the adapter create
        // event below if you wire it later). Better to let sign-in
        // proceed than to block the user out.
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // Re-read role + ensure it stays in sync with the allowlist.
        const fresh = await db.user.findUnique({
          where: { id: user.id },
          select: { role: true, email: true },
        });
        const role = fresh?.email && adminEmails.has(fresh.email.toLowerCase())
          ? 'ADMIN'
          : (fresh?.role ?? 'GUEST');
        session.user.role = role;
      }
      return session;
    },
  },
});
