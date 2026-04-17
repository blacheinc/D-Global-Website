import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { formatEventDate } from '@/lib/formatDate';
import type { Artist, Release } from '@prisma/client';

interface ReleaseCardProps {
  release: Release & { artist: Artist };
}

export function ReleaseCard({ release }: ReleaseCardProps) {
  return (
    <Link
      href={`/releases/${release.slug}`}
      className="group block overflow-hidden rounded-2xl border border-white/5 bg-surface card-lift"
    >
      <div className="relative aspect-square overflow-hidden">
        <Image
          src={release.coverImage}
          alt=""
          aria-hidden
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute top-3 left-3">
          <Badge tone="accent">{release.kind}</Badge>
        </div>
      </div>
      <div className="p-5">
        <p className="text-xs text-muted">{release.artist.stageName}</p>
        <h3 className="mt-1 font-display text-lg leading-tight">{release.title}</h3>
        <p className="mt-1 text-xs text-muted">{formatEventDate(release.releasedAt)}</p>
      </div>
    </Link>
  );
}
