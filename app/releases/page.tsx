import type { Metadata } from 'next';
import { ReleaseCard } from '@/features/releases/components/ReleaseCard';
import { listReleases } from '@/features/releases/queries';
import { Reveal } from '@/components/motion/Reveal';

export const metadata: Metadata = {
  title: 'Releases',
  description: 'Singles, EPs, albums and mixes from D-Global Records.',
};

export default async function ReleasesPage() {
  const releases = await listReleases();
  return (
    <section className="container-px py-14 md:py-20">
      <div className="max-w-3xl">
        <p className="eyebrow">Releases</p>
        <h1 className="mt-4 font-display text-display-xl text-balance">Everything we've put out.</h1>
        <p className="mt-4 text-muted md:text-lg max-w-xl">
          Stream our catalog across Spotify, Audiomack and YouTube.
        </p>
      </div>

      {releases.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-white/10 bg-surface p-12 text-center">
          <p className="text-muted">No releases yet. The catalog drops soon.</p>
        </div>
      ) : (
        <div className="mt-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {releases.map((r, i) => (
            <Reveal key={r.id} delay={i * 0.05}>
              <ReleaseCard release={r} />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}
