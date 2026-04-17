import 'server-only';
import { db } from '@/server/db';

export async function listReleases() {
  return db.release.findMany({
    orderBy: { releasedAt: 'desc' },
    include: { artist: true },
  });
}

export async function getReleaseBySlug(slug: string) {
  return db.release.findUnique({
    where: { slug },
    include: {
      artist: true,
      tracks: { orderBy: { order: 'asc' } },
    },
  });
}

export async function getAllReleaseSlugs() {
  const releases = await db.release.findMany({ select: { slug: true } });
  return releases.map((r) => r.slug);
}
