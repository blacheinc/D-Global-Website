import { withSentryConfig } from '@sentry/nextjs';

// Content Security Policy. Built as an allowlist of every external origin
// the app actually loads at runtime — Spotify embeds, Audiomack iframes,
// YouTube, Google Maps, Paystack inline checkout, Cloudinary/Unsplash
// images. Tightening this further later (e.g. nonces for inline scripts)
// is straightforward; loosening is a regression.
//
// `'unsafe-inline'` for script-src is required by next/script and the
// Next.js dev runtime; pair it with strict-dynamic + nonces in a future
// pass once we audit every inline tag.
//
// Sentry note: we tunnel browser events through `/monitoring` (configured
// below in withSentryConfig), which is same-origin and covered by
// connect-src 'self'. The *.ingest.sentry.io entry is the fallback path
// the SDK uses if the tunnel is unreachable on first init.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self' https://checkout.paystack.com https://standard.paystack.co",
  "script-src 'self' 'unsafe-inline' https://js.paystack.co https://plausible.io",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://i.scdn.co https://assets.audiomack.com https://res.cloudinary.com https://images.unsplash.com https://*.googleapis.com https://*.gstatic.com",
  "media-src 'self' https://res.cloudinary.com",
  "connect-src 'self' https://api.paystack.co https://checkout.paystack.com https://plausible.io https://*.sentry.io https://*.ingest.sentry.io",
  "frame-src 'self' https://open.spotify.com https://embed.audiomack.com https://www.google.com https://www.youtube.com https://www.youtube-nocookie.com https://checkout.paystack.com https://standard.paystack.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join('; ');

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
      baseHeaders.push({ key: 'Content-Security-Policy', value: csp });
    }
    return [{ source: '/:path*', headers: baseHeaders }];
  },
};

// Sentry's webpack plugin uploads source maps at build time when an auth
// token is present. Without a token (local builds, fork PRs) `silent: true`
// suppresses the "no token" warning and the upload step is skipped — the
// runtime SDK still works, you just lose source-mapped stack traces.
//
// `tunnelRoute: '/monitoring'` reserves that route as a same-origin proxy
// to Sentry's ingest endpoint so ad-blockers and strict CSPs don't drop
// events. Don't add a real /monitoring page — the proxy will shadow it.
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
    // Delete .map files from the final build output after upload — the
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
