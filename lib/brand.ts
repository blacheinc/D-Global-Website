// Single source of truth for brand colors in contexts where CSS variables
// are unavailable (edge-runtime ImageResponse, Next metadata themeColor,
// third-party component props that only accept raw strings).
//
// These hex values MUST stay in sync with the HSL tokens defined in
// `app/globals.css`'s :root block.
export const brand = {
  bg: '#000000',
  surface: '#1A1A1A',
  elevated: '#242424',
  accent: '#C00000',
  accentHot: '#F50000',
  accentDeep: '#7A0000',
  fg: '#FFFFFF',
  muted: '#B3B3B3',
  border: '#2E2E2E',
} as const;
