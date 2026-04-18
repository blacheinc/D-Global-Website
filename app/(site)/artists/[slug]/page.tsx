import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Instagram, Twitter, Calendar } from 'lucide-react';
import { getArtistBySlug, getAllArtistSlugs } from '@/features/artists/queries';
import { SpotifyEmbed } from '@/features/artists/components/SpotifyEmbed';
import { ArtistBookingForm } from '@/features/artistBookings/components/ArtistBookingForm';
import { Badge } from '@/components/ui/Badge';
import { formatEventDate } from '@/lib/formatDate';

export async function generateStaticParams() {
  const slugs = await getAllArtistSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtistBySlug(slug);
  if (!artist) return { title: 'Artist not found' };
  return {
    title: artist.stageName,
    description: artist.bio ?? `${artist.stageName} on D-Global Records.`,
  };
}

export default async function ArtistDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artist = await getArtistBySlug(slug);
  if (!artist) notFound();

  // lineupSlots is already filtered to upcoming at the DB layer.
  const upcomingLineup = artist.lineupSlots;

  return (
    <article>
      <section className="relative h-[55vh] md:h-[70vh] w-full overflow-hidden">
        {artist.heroImage && (
          <Image
            src={artist.heroImage}
            alt=""
            aria-hidden
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/20" />
        <div className="container container-px absolute inset-x-0 bottom-0 pb-10 md:pb-16">
          <p className="eyebrow">Artist</p>
          <h1 className="mt-3 font-display text-display-2xl text-balance">{artist.stageName}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href="#book"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hot"
            >
              Book this artist
            </a>
            {artist.instagram && (
              <a
                href={`https://instagram.com/${artist.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 text-sm hover:bg-white/10"
              >
                <Instagram aria-hidden className="h-4 w-4" />
                @{artist.instagram}
              </a>
            )}
            {artist.twitter && (
              <a
                href={`https://twitter.com/${artist.twitter}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 text-sm hover:bg-white/10"
              >
                <Twitter aria-hidden className="h-4 w-4" />
                @{artist.twitter}
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="container container-px py-14 md:py-20 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 lg:gap-16">
        <div className="space-y-12">
          {artist.bio && (
            <div>
              <p className="eyebrow mb-4">Bio</p>
              <p className="text-muted leading-relaxed max-w-prose whitespace-pre-line">
                {artist.bio}
              </p>
            </div>
          )}

          {artist.spotifyId && (
            <div>
              <p className="eyebrow mb-4">On Spotify</p>
              <SpotifyEmbed id={artist.spotifyId} kind="artist" />
            </div>
          )}

          {artist.releases.length > 0 && (
            <div>
              <p className="eyebrow mb-4">Discography</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {artist.releases.map((r) => (
                  <Link
                    key={r.id}
                    href={`/releases/${r.slug}`}
                    className="group flex gap-4 rounded-2xl border border-white/10 bg-surface p-4 card-lift"
                  >
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
                      <Image
                        src={r.coverImage}
                        alt=""
                        aria-hidden
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <Badge tone="accent">{r.kind}</Badge>
                      <p className="mt-2 font-display text-lg truncate">{r.title}</p>
                      <p className="text-xs text-muted">{formatEventDate(r.releasedAt)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 h-max">
          {upcomingLineup.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-surface p-6">
              <p className="eyebrow mb-4">Upcoming shows</p>
              <ul className="space-y-3">
                {upcomingLineup.map((slot) =>
                  slot.event ? (
                    <li key={slot.id}>
                      <Link
                        href={`/events/${slot.event.slug}`}
                        className="flex gap-3 items-start hover:text-accent"
                      >
                        <Calendar aria-hidden className="h-4 w-4 mt-1 text-accent shrink-0" />
                        <div>
                          <p className="font-medium">{slot.event.title}</p>
                          <p className="text-xs text-muted">
                            {formatEventDate(slot.event.startsAt)} · {slot.event.venueName}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          )}
        </aside>
      </section>

      <section
        id="book"
        aria-labelledby="book-title"
        className="border-t border-white/5 bg-surface/30"
      >
        <div className="container container-px py-14 md:py-20 max-w-3xl">
          <p className="eyebrow">Booking</p>
          <h2 id="book-title" className="mt-3 font-display text-3xl md:text-4xl">
            Book {artist.stageName}
          </h2>
          <p className="mt-3 text-sm text-muted max-w-xl">
            Festival, brand activation, private event, tell us the shape of the show and we'll
            come back with availability and a quote.
          </p>
          <div className="mt-10">
            <ArtistBookingForm artistId={artist.id} artistName={artist.stageName} />
          </div>
        </div>
      </section>
    </article>
  );
}
