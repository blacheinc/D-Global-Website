import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

// /admin/ is auth-gated at the layout, but path-guessing crawlers (and any
// external link someone accidentally shares) would still probe it and may
// index the sign-in redirect with the admin path embedded in ?callbackUrl=.
// Disallowing here is belt-and-suspenders with the admin layout's
// `robots: { index: false, follow: false }` metadata.
//
// /api/ and /tickets/ likewise gated, with sensitive dynamic URLs (order
// IDs, QR tokens) that shouldn't be cached or indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/admin/', '/tickets/'] }],
    sitemap: `${env.NEXT_PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
