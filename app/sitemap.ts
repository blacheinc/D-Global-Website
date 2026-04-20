import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { getAllEventSlugs } from '@/features/events/queries';
// Artist and release slug queries are intentionally unimported while the
// record-label side is paused — the corresponding sitemap entries are
// commented out below. Re-add both the imports and the routes when the
// label relaunches.
// import { getAllArtistSlugs } from '@/features/artists/queries';
// import { getAllReleaseSlugs } from '@/features/releases/queries';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_SITE_URL;
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/events`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/bookings`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/gallery`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ];

  // Pull dynamic content slugs in parallel. If the DB is unavailable at
  // build time, fall back to static-only so the sitemap still generates.
  const eventSlugs = await getAllEventSlugs().catch(() => [] as string[]);

  const dynamicRoutes: MetadataRoute.Sitemap = eventSlugs.map((slug) => ({
    url: `${base}/events/${slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [...staticRoutes, ...dynamicRoutes];
}
