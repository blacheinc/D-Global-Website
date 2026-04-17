import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getReleaseBySlug, getAllReleaseSlugs } from '@/features/releases/queries';
import { SpotifyEmbed } from '@/features/artists/components/SpotifyEmbed';
import { AudiomackEmbed } from '@/features/artists/components/AudiomackEmbed';
import { Badge } from '@/components/ui/Badge';
import { formatEventDate } from '@/lib/formatDate';

export async function generateStaticParams() {
  const slugs = await getAllReleaseSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const release = await getReleaseBySlug(slug);
  if (!release) return { title: 'Release not found' };
  return {
    title: `${release.title} — ${release.artist.stageName}`,
    openGraph: { images: [release.coverImage] },
  };
}

function extractSpotifyId(url: string): { id: string; kind: 'album' | 'track' } | null {
  const m = url.match(/open\.spotify\.com\/(album|track)\/([A-Za-z0-9]+)/);
  if (!m || !m[1] || !m[2]) return null;
  return { kind: m[1] as 'album' | 'track', id: m[2] };
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default async function ReleaseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const release = await getReleaseBySlug(slug);
  if (!release) notFound();

  const spotify = release.spotifyUrl ? extractSpotifyId(release.spotifyUrl) : null;

  return (
    <article className="container container-px py-14 md:py-20">
      <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-10">
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/5">
          <Image
            src={release.coverImage}
            alt={release.title}
            fill
            priority
            sizes="(min-width: 768px) 360px, 100vw"
            className="object-cover"
          />
        </div>

        <div>
          <Badge tone="accent">{release.kind}</Badge>
          <h1 className="mt-4 font-display text-display-xl text-balance">{release.title}</h1>
          <p className="mt-2 text-lg text-muted">
            <Link href={`/artists/${release.artist.slug}`} className="hover:text-accent">
              {release.artist.stageName}
            </Link>
            {' '}· {formatEventDate(release.releasedAt)}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {release.spotifyUrl && (
              <a
                href={release.spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center rounded-full border border-white/15 bg-white/5 px-5 text-sm hover:bg-white/10"
              >
                Spotify
              </a>
            )}
            {release.audiomackUrl && (
              <a
                href={release.audiomackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center rounded-full border border-white/15 bg-white/5 px-5 text-sm hover:bg-white/10"
              >
                Audiomack
              </a>
            )}
            {release.youtubeUrl && (
              <a
                href={release.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center rounded-full border border-white/15 bg-white/5 px-5 text-sm hover:bg-white/10"
              >
                YouTube
              </a>
            )}
          </div>

          {release.tracks.length > 0 && (
            <div className="mt-8">
              <p className="eyebrow mb-4">Tracklist</p>
              <ol className="divide-y divide-white/5 rounded-2xl border border-white/5 bg-surface overflow-hidden">
                {release.tracks.map((t, i) => (
                  <li key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="text-muted tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                      <span className="truncate">{t.title}</span>
                    </div>
                    <span className="text-muted tabular-nums text-xs">{formatDuration(t.durationSec)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      {(spotify || release.audiomackUrl) && (
        <div className="mt-12 max-w-3xl space-y-6">
          {spotify && <SpotifyEmbed id={spotify.id} kind={spotify.kind} />}
          {release.audiomackUrl && <AudiomackEmbed url={release.audiomackUrl} />}
        </div>
      )}
    </article>
  );
}
