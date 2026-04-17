import 'server-only';
import { cache } from 'react';
import { db } from '@/server/db';

export async function listReleases() {
  return db.release.findMany({
    orderBy: { releasedAt: 'desc' },
    include: { artist: true },
  });
}

// `cache()` de-duplicates within a single request, so `generateMetadata`
// and the page body share one DB round-trip.
export const getReleaseBySlug = cache(async (slug: string) => {
  return db.release.findUnique({
    where: { slug },
    include: {
      artist: true,
      tracks: { orderBy: { order: 'asc' } },
    },
  });
});

export async function getAllReleaseSlugs() {
  const releases = await db.release.findMany({ select: { slug: true } });
  return releases.map((r) => r.slug);
}
