'use client';

interface SpotifyEmbedProps {
  id: string;
  kind?: 'artist' | 'album' | 'track' | 'playlist';
  height?: number;
}

export function SpotifyEmbed({ id, kind = 'artist', height = 352 }: SpotifyEmbedProps) {
  return (
    <iframe
      title="Spotify"
      style={{ borderRadius: 12 }}
      src={`https://open.spotify.com/embed/${kind}/${id}?utm_source=generator&theme=0`}
      width="100%"
      height={height}
      frameBorder="0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
    />
  );
}
