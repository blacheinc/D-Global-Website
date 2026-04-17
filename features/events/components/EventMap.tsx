'use client';

import { useState } from 'react';

interface EventMapProps {
  embedUrl?: string | null;
  venueName: string;
  address?: string | null;
}

export function EventMap({ embedUrl, venueName, address }: EventMapProps) {
  const [loaded, setLoaded] = useState(false);

  if (!embedUrl) {
    return (
      <div className="aspect-video w-full rounded-2xl border border-white/10 bg-elevated p-6 grid place-items-center text-muted">
        <div className="text-center">
          <p className="text-sm">Map coming soon</p>
          <p className="text-xs mt-1">{venueName}{address ? ` — ${address}` : ''}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-elevated">
      {!loaded && (
        <div className="absolute inset-0 grid place-items-center text-muted text-sm">
          Loading map…
        </div>
      )}
      <iframe
        src={embedUrl}
        title={`Map — ${venueName}`}
        width="100%"
        height="100%"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 h-full w-full grayscale invert-[0.9] hue-rotate-180"
      />
    </div>
  );
}
