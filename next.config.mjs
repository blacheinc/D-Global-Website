import { withSentryConfig } from '@sentry/nextjs';

// Derive the Plausible origin from the configured script URL so self-hosted
// deployments (e.g. NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL="https://analytics.
// mysite.com/js/script.js") get script-src + connect-src allowlisted
// automatically. Plausible puts the event beacon (/api/event) on the
// same origin as the script, so one derived value covers both.
//
// Defensive: require https:. `javascript:` and other non-HTTP(S) schemes
// parse without throwing and would produce an `origin` of the literal
// string "null", which would silently corrupt the CSP allowlist. Falling
// back to plausible.io on anything unexpected keeps the policy valid.
const plausibleOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL ?? 'https://plausible.io/js/script.js';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return 'https://plausible.io';
    return parsed.origin;
  } catch {
    return 'https://plausible.io';
  }
})();

// R2's public-read bucket gets served from a Cloudflare domain (either a
// custom domain bound to the bucket, or pub-<id>.r2.dev). Derive the
// origin so CSP img-src and next/image's remotePatterns both know where
// admin-uploaded assets live. Same https-only defensive check as
// plausibleOrigin, rejects schemes that would silently corrupt the
// allowlist.
const r2PublicOrigin = (() => {
  const url = process.env.R2_PUBLIC_URL;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
})();
const r2PublicHost = r2PublicOrigin ? new URL(r2PublicOrigin).hostname : null;

// Content Security Policy. Allowlist of origins we either load from today
// or have pre-authorized for the integration families this app ships with
// (Spotify, Audiomack, YouTube, Google Maps, Paystack, Plausible, Sentry,
// Cloudinary/Unsplash). Pre-authorization matters: adding a YouTube embed
// or the Paystack popup later doesn't need a CSP PR, just the feature PR.
// Loosening is a regression; tightening is a future improvement.
//
// Per-directive status (useful when auditing, keep this in sync):
//   script-src
//     'self' 'unsafe-inline'            → required (Next/font + hydration)
//     https://js.paystack.co            → pre-auth (Paystack inline popup;
//                                          current flow is full-page redirect,
//                                          not popup, keep for future UX)
//     <plausibleOrigin>                 → used (PlausibleScript); derived
//                                          from NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL
//                                          so self-hosted instances work
//   frame-src
//     https://open.spotify.com          → used (SpotifyEmbed)
//     https://embed.audiomack.com       → used (AudiomackEmbed)
//     https://www.google.com            → used (EventMap → maps/embed)
//     https://www.youtube.com           → pre-auth (release pages link to
//     https://www.youtube-nocookie.com     YouTube today; iframe later)
//     https://checkout.paystack.com     → pre-auth (inline-popup iframe;
//     https://standard.paystack.co         current flow navigates instead)
//   connect-src
//     <plausibleOrigin>                 → used (tracking beacon)
//     https://*.sentry.io               → used (fallback when tunnel fails)
//     https://*.ingest.sentry.io        → used (regional ingest fallback)
//     https://api.paystack.co           → pre-auth (all Paystack HTTP is
//     https://checkout.paystack.com        server-side today; here for
//                                          future client-initiated calls)
//   form-action
//     https://checkout.paystack.com     → pre-auth (current checkout POSTs
//     https://standard.paystack.co         to /api/... same-origin, then JS
//                                          redirects, no form submit to
//                                          Paystack. Kept for future popup.)
//   img-src                              → used (Spotify/Audiomack/Cloudinary/
//                                          Unsplash covers + Maps statics +
//                                          R2 public host when R2 is configured)
//   media-src 'self'                     → used (hero video is same-origin)
//
// `'unsafe-inline'` for script-src is required by next/font and the Next.js
// dev runtime; pair it with strict-dynamic + nonces in a future pass once
// we audit every inline tag.
//
// Sentry note: browser events tunnel through `/monitoring` (configured
// below in withSentryConfig), which is same-origin and covered by
// connect-src 'self'. The *.ingest.sentry.io entry is the fallback path
// the SDK uses if the tunnel is unreachable on first init.
const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self' https://checkout.paystack.com https://standard.paystack.co",
  `script-src 'self' 'unsafe-inline' https://js.paystack.co ${plausibleOrigin}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src 'self' data: blob: https://i.scdn.co https://assets.audiomack.com https://res.cloudinary.com https://images.unsplash.com https://*.googleapis.com https://*.gstatic.com${r2PublicOrigin ? ` ${r2PublicOrigin}` : ''}`,
  "media-src 'self'",
  `connect-src 'self' https://api.paystack.co https://checkout.paystack.com ${plausibleOrigin} https://*.sentry.io https://*.ingest.sentry.io`,
  "frame-src 'self' https://open.spotify.com https://embed.audiomack.com https://www.google.com https://www.youtube.com https://www.youtube-nocookie.com https://checkout.paystack.com https://standard.paystack.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
  // Browsers POST violations here. The legacy directive (report-uri) is
  // still the most widely supported; Reporting API (report-to) is wired
  // alongside via the Reporting-Endpoints header below.
  'report-uri /api/csp-report',
  "report-to csp-endpoint",
];
const csp = cspDirectives.join('; ');

// Report-Only mode lets us roll out a new CSP without breaking the site.
// Browsers evaluate the policy and POST violations to /api/csp-report but
// don't actually block anything. Use CSP_REPORT_ONLY=1 when introducing a
// tightening change (e.g. removing 'unsafe-inline'), watch Sentry for a
// few days, then flip back to enforcing.
const cspReportOnly = process.env.CSP_REPORT_ONLY === '1';
const cspHeaderName = cspReportOnly
  ? 'Content-Security-Policy-Report-Only'
  : 'Content-Security-Policy';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@prisma/client'],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'i.scdn.co' },
      { protocol: 'https', hostname: 'assets.audiomack.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // R2 public host, derived from R2_PUBLIC_URL at build time. Admin
      // uploads land here; next/image needs it to optimize them.
      ...(r2PublicHost ? [{ protocol: 'https', hostname: r2PublicHost }] : []),
    ],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'framer-motion'],
  },
  async headers() {
    const baseHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=()',
      },
    ];
    // CSP and HSTS only in production. CSP in dev would block Next's HMR
    // websocket and the React Refresh runtime; HSTS in dev would stickily
    // force HTTPS on localhost in browsers that obeyed it.
    if (process.env.NODE_ENV === 'production') {
      baseHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      });
      baseHeaders.push({ key: cspHeaderName, value: csp });
      // Reporting API endpoint registration. Browsers that support
      // report-to read this and route violations of the named group to
      // the URL. max_age is one day, short enough that policy changes
      // propagate quickly, long enough to survive a session.
      baseHeaders.push({
        key: 'Reporting-Endpoints',
        value: 'csp-endpoint="/api/csp-report"',
      });
    }
    return [{ source: '/:path*', headers: baseHeaders }];
  },
};

// Sentry's webpack plugin uploads source maps at build time when an auth
// token is present. Without a token (local builds, fork PRs) `silent: true`
// suppresses the "no token" warning and the upload step is skipped, the
// runtime SDK still works, you just lose source-mapped stack traces.
//
// `tunnelRoute: '/monitoring'` reserves that route as a same-origin proxy
// to Sentry's ingest endpoint so ad-blockers and strict CSPs don't drop
// events. Don't add a real /monitoring page, the proxy will shadow it.
export default withSentryConfig(nextConfig, {
  silent: !process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: '/monitoring',
  // Pick up every chunk Next 15 emits, not just the default patterns.
  widenClientFileUpload: true,
  // Strip the SDK's own console.log/warn in production builds so the
  // Sentry plumbing stays invisible to end users.
  disableLogger: true,
  sourcemaps: {
    // Delete .map files from the final build output after upload, the
    // maps are still in Sentry, just not served publicly.
    deleteSourcemapsAfterUpload: true,
  },
  // Tree-shake Replay (we don't use it) and the Sentry SDK debug helpers
  // out of the client bundle. Tracing stays since we sample 10%.
  bundleSizeOptimizations: {
    excludeReplayIntegration: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
    excludeDebugStatements: true,
  },
});
