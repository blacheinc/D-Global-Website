import { ImageResponse } from 'next/og';
import { site } from '@/lib/site';

export const runtime = 'edge';
export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '72px',
          color: '#FFFFFF',
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(192,0,0,0.45), transparent 60%), linear-gradient(180deg, #000000 0%, #000000 60%, #0a0000 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 72,
            left: 72,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            letterSpacing: 6,
            fontSize: 22,
            color: '#C00000',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          <div style={{ width: 40, height: 2, background: '#C00000' }} />
          Accra · Nightlife
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 128,
            lineHeight: 1,
            letterSpacing: -3,
            fontWeight: 700,
          }}
        >
          {site.name}
        </div>

        <div
          style={{
            marginTop: 24,
            fontSize: 40,
            color: '#B3B3B3',
            fontWeight: 400,
            maxWidth: 900,
          }}
        >
          {site.tagline}
        </div>

        <div
          style={{
            position: 'absolute',
            right: 72,
            bottom: 72,
            display: 'flex',
            alignItems: 'center',
            fontSize: 20,
            color: '#B3B3B3',
            letterSpacing: 4,
            textTransform: 'uppercase',
          }}
        >
          Accra · Ghana
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: '2px solid rgba(192,0,0,0.25)',
            margin: 48,
            borderRadius: 24,
            pointerEvents: 'none',
          }}
        />
      </div>
    ),
    {
      ...size,
    },
  );
}
