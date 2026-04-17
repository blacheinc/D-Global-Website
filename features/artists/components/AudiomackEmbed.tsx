'use client';

interface AudiomackEmbedProps {
  url: string;
  height?: number;
}

export function AudiomackEmbed({ url, height = 252 }: AudiomackEmbedProps) {
  const src = url.replace('audiomack.com', 'audiomack.com/embed');
  return (
    <iframe
      title="Audiomack"
      src={src}
      width="100%"
      height={height}
      className="rounded-xl border border-white/10"
      loading="lazy"
      allow="autoplay"
    />
  );
}
