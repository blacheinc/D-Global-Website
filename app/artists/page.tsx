import type { Metadata } from 'next';
import { ArtistCard } from '@/features/artists/components/ArtistCard';
import { listArtists } from '@/features/artists/queries';
import { Reveal } from '@/components/motion/Reveal';

export const metadata: Metadata = {
  title: 'Artists',
  description: 'Meet the producers, selectors and performers behind the D-Global sound.',
};

export default async function ArtistsPage() {
  const artists = await listArtists();
  return (
    <section className="container-px py-14 md:py-20">
      <div className="max-w-3xl">
        <p className="eyebrow">Record Label</p>
        <h1 className="mt-4 font-display text-display-xl text-balance">
          Artists on the label.
        </h1>
        <p className="mt-4 text-muted md:text-lg max-w-xl">
          The producers, selectors and performers building the sound of the next decade.
        </p>
      </div>

      {artists.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-white/10 bg-surface p-12 text-center">
          <p className="text-muted">The roster is being finalised. Check back soon.</p>
        </div>
      ) : (
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {artists.map((a, i) => (
            <Reveal key={a.id} delay={i * 0.05}>
              <ArtistCard artist={a} />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}
