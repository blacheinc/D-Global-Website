import { PrismaClient } from '@prisma/client';

// Idempotent admin provisioning. Run with `pnpm db:seed:admin`.
//
// Why a separate script instead of folding this into seed.ts: the main
// seed wipes Events / Orders / Bookings / Artists / etc. via deleteMany
// so demo content stays clean across runs. Admins are infrastructure,
// not content — nobody wants `pnpm db:seed` to nuke their real data
// just to (re)ensure two admin rows exist. Keeping this split also
// means you can safely run it in staging / production without the
// destructive preamble.
//
// Relationship to ADMIN_EMAILS + auth.ts:
//   - ADMIN_EMAILS is the source of truth at sign-in / request time.
//     The signIn + session callbacks re-read role from the allowlist
//     on every request; removing an email there revokes access
//     immediately without any DB edit.
//   - This script pre-creates User rows with role=ADMIN so admins
//     aren't invisible in Prisma Studio before their first sign-in,
//     and so a fresh environment has a clearly-auditable admin set.
//     On first sign-in, NextAuth's PrismaAdapter reuses the existing
//     row by email instead of creating a new one, so there's no
//     duplicate-user drift.
//
// Safety properties:
//   - Upsert, not create → safe to re-run.
//   - No delete, no role downgrade of non-listed users — if an operator
//     later wants to demote an admin, remove them from ADMIN_EMAILS;
//     the session callback handles the rest.

const db = new PrismaClient();

function parseAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function main() {
  const emails = parseAdminEmails();
  if (emails.length === 0) {
    console.log(
      '[seed-admin] ADMIN_EMAILS is empty — nothing to seed. Set it in .env to a comma-separated list of admin emails and re-run.',
    );
    return;
  }

  const results = await Promise.all(
    emails.map((email) =>
      db.user.upsert({
        where: { email },
        // emailVerified is set to now on both create and update so an
        // admin can sign in without NextAuth prompting to re-verify a
        // never-before-seen address on first attempt. NextAuth's
        // magic-link flow still issues a single-use token and validates
        // it — this field just marks the address as known-good.
        create: { email, role: 'ADMIN', emailVerified: new Date() },
        update: { role: 'ADMIN' },
        select: { id: true, email: true, role: true, createdAt: true },
      }),
    ),
  );

  for (const u of results) {
    console.log(`[seed-admin] ${u.email} · ${u.role} · id=${u.id}`);
  }
  console.log(`[seed-admin] provisioned ${results.length} admin user${results.length === 1 ? '' : 's'}.`);
}

main()
  .then(() => db.$disconnect())
  .catch((err) => {
    console.error(err);
    db.$disconnect();
    process.exit(1);
  });
