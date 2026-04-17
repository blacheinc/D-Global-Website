import 'server-only';
import { cache } from 'react';
import { db } from '@/server/db';

export async function getFeaturedArtists({ take = 8 }: { take?: number } = {}) {
  return db.artist.findMany({
    where: { featured: true },
    orderBy: { createdAt: 'desc' },
    take,
  });
}

export async function listArtists() {
  return db.artist.findMany({
    orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    include: { releases: { take: 1, orderBy: { releasedAt: 'desc' } } },
  });
}

// `cache()` de-duplicates within a single request, so `generateMetadata`
// and the page body share one DB round-trip.
export const getArtistBySlug = cache(async (slug: string) => {
  // Filter lineupSlots to upcoming events at the DB layer — the only consumer
  // (artist detail page) never renders past shows, so fetching them wastes a
  // roundtrip row-count for artists with long gig histories.
  const now = new Date();
  return db.artist.findUnique({
    where: { slug },
    include: {
      releases: {
        orderBy: { releasedAt: 'desc' },
        include: { tracks: { orderBy: { order: 'asc' } } },
      },
      lineupSlots: {
        where: { event: { startsAt: { gte: now } } },
        include: { event: true },
        orderBy: { slotStart: 'asc' },
      },
    },
  });
});

export async function getAllArtistSlugs() {
  const artists = await db.artist.findMany({ select: { slug: true } });
  return artists.map((a) => a.slug);
}
