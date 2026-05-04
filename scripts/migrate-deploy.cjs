#!/usr/bin/env node
// Wrapper around `prisma migrate deploy` that swaps the pooled DATABASE_URL
// for a direct connection during migration only.
//
// Why: this project runs on Neon, which exposes two endpoints per branch:
//   - the pooled URL (host contains `-pooler.`), great for runtime
//     queries because pgbouncer-style pooling lets a serverless instance
//     reuse a connection across cold starts.
//   - the direct URL (no `-pooler.`), required for migrations because
//     advisory locks (used by `prisma migrate deploy` to serialize
//     concurrent migrations) only behave correctly on a session-level
//     Postgres connection. Through Neon's transaction-mode pooler, the
//     advisory lock can be acquired but the lock-holder check across
//     statements fails unpredictably, surfacing as
//       P1002: Timed out trying to acquire a postgres advisory lock
//     ten seconds into the build.
//
// Resolution order:
//   1. DIRECT_URL env var if explicitly set (operator override / non-Neon
//      databases that need a different host).
//   2. DATABASE_URL with `-pooler.` stripped from the host. Cheap heuristic
//      that handles the Neon case without requiring a second env var.
//   3. DATABASE_URL untouched. Self-hosted Postgres / databases that don't
//      use a pooler hit this branch and migrate exactly as before.
//
// The replacement only applies inside the child process that runs the
// migration. The runtime DATABASE_URL on Vercel stays pooled, which is
// what we want for the Node server.

const { spawnSync } = require('node:child_process');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('[migrate] DATABASE_URL is not set; skipping `prisma migrate deploy`.');
  // Don't fail the build, this happens on environments that don't run
  // Prisma (e.g. preview Vercel envs without a database wired up). The
  // app's runtime queries will fail loudly enough later if a DB really
  // is missing.
  process.exit(0);
}

function deriveDirectUrl(raw) {
  if (process.env.DIRECT_URL) return process.env.DIRECT_URL;
  // Only mutate the host segment so we don't accidentally rewrite a
  // password / dbname that happens to contain `-pooler.`. URL parsing
  // also normalises percent-encoding so we hand a clean string to the
  // Prisma child process.
  try {
    const u = new URL(raw);
    if (u.hostname.includes('-pooler.')) {
      u.hostname = u.hostname.replace('-pooler.', '.');
      return u.toString();
    }
  } catch {
    // Malformed URL, leave it. Prisma will surface a clearer error
    // than we could from here.
  }
  return raw;
}

const directUrl = deriveDirectUrl(dbUrl);

if (directUrl !== dbUrl) {
  // Don't print the URL itself; it has credentials embedded.
  console.log('[migrate] using direct (non-pooled) connection for migration.');
}

const result = spawnSync('prisma', ['migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: directUrl },
});

if (result.error) {
  console.error('[migrate] failed to spawn prisma:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
