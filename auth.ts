import NextAuth from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Role } from '@prisma/client';
import { db } from '@/server/db';
import { env, adminEmails } from '@/lib/env';
import { sendMagicLink } from '@/server/email/magicLink';
import { captureError } from '@/server/observability';

// NextAuth v5 (Auth.js) config. Magic-link only, no passwords, no OAuth.
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
// sessions server-side, a bad trade for an admin surface.

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  secret: env.AUTH_SECRET,
  trustHost: true,
  providers: [
    Nodemailer({
      // The `server` config is required by Auth.js's type but unused by
      // us, sendVerificationRequest takes over the actual transport.
      server: { host: 'unused', port: 0, auth: { user: 'unused', pass: 'unused' } },
      from: env.EMAIL_FROM,
      // 10 minutes. NextAuth defaults to 24h which is a long window for
      // a single-use credential, enterprise mail scanners (Microsoft Safe
      // Links, Google's preview bot, archiving systems) routinely fetch URLs
      // in email and can burn the token before the user clicks it, and a
      // leaked 24h link stays valid for a whole day. 10 minutes is enough
      // for a human to switch to their inbox and click; prefetch bots that
      // burn the token fail on the same timer.
      maxAge: 10 * 60,
      async sendVerificationRequest({ identifier, url }) {
        // If the send fails, NextAuth surfaces a generic "check your email"
        // response to the user regardless, meaning the actual cause (Resend
        // outage, bad API key, unverified sending domain) would be invisible
        // without explicit capture. captureError logs + ships to Sentry, then
        // rethrows so NextAuth still treats the sign-in attempt as failed.
        try {
          await sendMagicLink({ to: identifier, url });
        } catch (err) {
          captureError('[auth] magic link send failed', err, { identifier });
          throw err;
        }
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
      const normalizedEmail = user.email.toLowerCase();
      const isAdmin = adminEmails.has(normalizedEmail);
      // Read-before-update so the first-ever sign-in (where the adapter
      // hasn't created the User row yet) doesn't emit a noisy Prisma
      // "Record to update not found" error every time a new address
      // requests a magic link. The session callback re-syncs role on
      // every request anyway, so missing the first-sign-in write is
      // harmless, the next loaded session picks up the allowlist.
      const existing = await db.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (existing) {
        await db.user.update({
          where: { email: normalizedEmail },
          data: { role: isAdmin ? 'ADMIN' : 'GUEST' },
        });
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // Re-read role + ensure it stays in sync with the allowlist on
        // every request, not just on sign-in. This is the enforcement
        // point for admin revocation, if we only trusted the DB role,
        // a removed admin with an active session would keep ADMIN access
        // until the session expired (up to 30d by default).
        const fresh = await db.user.findUnique({
          where: { id: user.id },
          select: { role: true, email: true },
        });
        const inAllowlist = !!fresh?.email && adminEmails.has(fresh.email.toLowerCase());
        let role: Role = fresh?.role ?? 'GUEST';
        if (inAllowlist) {
          role = 'ADMIN';
        } else if (role === 'ADMIN') {
          // Stale: DB still says ADMIN but the email was removed from the
          // allowlist. Force the downgrade at read time so revocation is
          // effective immediately. Preserve STAFF/ARTIST (non-ADMIN roles
          // aren't governed by the allowlist).
          role = 'GUEST';
        }
        session.user.role = role;
      }
      return session;
    },
  },
});
