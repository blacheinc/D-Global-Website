import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ArtistCarousel } from '@/features/artists/components/ArtistCarousel';
import { getFeaturedArtists } from '@/features/artists/queries';
import { Reveal } from '@/components/motion/Reveal';

export async function ArtistCarouselSection() {
  const artists = await getFeaturedArtists();
  if (artists.length === 0) return null;

  return (
    <section className="container container-px section-y">
      <Reveal>
        <div className="flex items-end justify-between gap-6 flex-wrap mb-10">
          <div className="max-w-2xl">
            <p className="eyebrow">Record Label</p>
            <h2 className="mt-4 font-display text-display-xl text-balance">
              The artists building the sound.
            </h2>
            <p className="mt-3 text-muted md:text-lg">
              Home to the producers, selectors and performers shaping what Accra hears next.
            </p>
          </div>
          <Link
            href="/artists"
            className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent-hot"
          >
            All artists <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>
      <ArtistCarousel artists={artists} />
    </section>
  );
}
