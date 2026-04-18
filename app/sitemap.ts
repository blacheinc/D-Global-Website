import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { getAllEventSlugs } from '@/features/events/queries';
import { getAllArtistSlugs } from '@/features/artists/queries';
import { getAllReleaseSlugs } from '@/features/releases/queries';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_SITE_URL;
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/events`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/bookings`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/artists`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/releases`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/gallery`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ];

  // Pull dynamic content slugs in parallel. If the DB is unavailable at
  // build time, fall back to static-only so the sitemap still generates.
  const [eventSlugs, artistSlugs, releaseSlugs] = await Promise.all([
    getAllEventSlugs().catch(() => [] as string[]),
    getAllArtistSlugs().catch(() => [] as string[]),
    getAllReleaseSlugs().catch(() => [] as string[]),
  ]);

  const dynamicRoutes: MetadataRoute.Sitemap = [
    ...eventSlugs.map((slug) => ({
      url: `${base}/events/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...artistSlugs.map((slug) => ({
      url: `${base}/artists/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...releaseSlugs.map((slug) => ({
      url: `${base}/releases/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  ];

  return [...staticRoutes, ...dynamicRoutes];
}
