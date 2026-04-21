'use client';

import { useState } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';

interface EventMapProps {
  embedUrl?: string | null;
  venueName: string;
  address?: string | null;
}

// Google Maps serves only the "Embed a map" URL format (/maps/embed?pb=...)
// with embedding-friendly headers. Short-links (maps.app.goo.gl),
// place-page URLs (/maps/place/...), and the classic maps.google.com
// homepage URLs all come back with X-Frame-Options: SAMEORIGIN, so the
// iframe renders blank regardless of CSP. Detect the safe format up
// front and render a link-out card for everything else — the admin
// gets something useful on the page without the browser screaming CSP.
function isEmbeddableMapUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname !== 'www.google.com' && u.hostname !== 'maps.google.com') return false;
    return u.pathname.startsWith('/maps/embed');
  } catch {
    return false;
  }
}

export function EventMap({ embedUrl, venueName, address }: EventMapProps) {
  const [loaded, setLoaded] = useState(false);

  if (!embedUrl) {
    return (
      <div className="aspect-video w-full rounded-2xl border border-white/10 bg-elevated p-6 grid place-items-center text-muted">
        <div className="text-center">
          <p className="text-sm">Map coming soon</p>
          <p className="text-xs mt-1">
            {venueName}
            {address ? `, ${address}` : ''}
          </p>
        </div>
      </div>
    );
  }

  // Admin pasted a share-link / place-page / short-link. Don't try to
  // iframe it — render a clickable card that opens the map in a new
  // tab instead. The UX is worse than an inline iframe but strictly
  // better than a blocked frame + a CSP error in the console.
  if (!isEmbeddableMapUrl(embedUrl)) {
    return (
      <a
        href={embedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-elevated p-6 text-center hover:border-accent/40 transition-colors"
      >
        <MapPin aria-hidden className="h-8 w-8 text-accent" />
        <div>
          <p className="font-medium">{venueName}</p>
          {address && <p className="mt-1 text-xs text-muted">{address}</p>}
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted group-hover:text-foreground">
          Open in Google Maps <ExternalLink aria-hidden className="h-3 w-3" />
        </span>
      </a>
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
        title={`Map, ${venueName}`}
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
