import 'server-only';
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

export async function getArtistBySlug(slug: string) {
  return db.artist.findUnique({
    where: { slug },
    include: {
      releases: {
        orderBy: { releasedAt: 'desc' },
        include: { tracks: { orderBy: { order: 'asc' } } },
      },
      lineupSlots: {
        include: { event: true },
        orderBy: { slotStart: 'asc' },
      },
    },
  });
}

export async function getAllArtistSlugs() {
  const artists = await db.artist.findMany({ select: { slug: true } });
  return artists.map((a) => a.slug);
}
