import Image from 'next/image';
import Link from 'next/link';
import type { Artist, Release } from '@prisma/client';

interface ArtistCardProps {
  artist: Artist & { releases?: Release[] };
}

export function ArtistCard({ artist }: ArtistCardProps) {
  const latest = artist.releases?.[0];
  return (
    <Link
      href={`/artists/${artist.slug}`}
      className="group block overflow-hidden rounded-2xl border border-white/5 bg-surface card-lift"
    >
      <div className="relative aspect-[3/4]">
        {artist.heroImage ? (
          <Image
            src={artist.heroImage}
            alt=""
            aria-hidden
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div aria-hidden className="h-full w-full grid place-items-center bg-elevated text-muted">
            <span className="font-display text-3xl">{artist.stageName.charAt(0)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent">Artist</p>
          <p className="mt-1 font-display text-2xl leading-tight">{artist.stageName}</p>
          {latest && <p className="mt-1 text-xs text-muted truncate">Latest: {latest.title}</p>}
        </div>
      </div>
    </Link>
  );
}
