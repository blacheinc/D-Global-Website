// Lightweight Plausible wrapper. Calls window.plausible when the script
// has been loaded; otherwise no-ops. The script is rendered conditionally
// from <PlausibleScript /> in the root layout — if the env domain is
// blank (dev, previews, self-hosted without analytics), there's no
// global to call and we silently skip. Server callers also no-op since
// `window` is undefined there.

// Plausible's API accepts string | number for custom props — booleans,
// null, and nested objects are rejected server-side. Keep `undefined` in
// the union so callers can pass conditional props (`{ feature: flag ?
// 'enabled' : undefined }`) and let us filter them out before sending.
type Props = Record<string, string | number | undefined>;

type PlausibleFn = (event: string, options?: { props?: Props; callback?: () => void }) => void;

declare global {
  interface Window {
    plausible?: PlausibleFn & { q?: unknown[] };
  }
}

export function track(event: string, props?: Props): void {
  if (typeof window === 'undefined') return;
  // Plausible's snippet defines window.plausible as a queue stub before
  // the real script loads; calls made early get replayed once the script
  // arrives. Either form is callable here.
  if (typeof window.plausible !== 'function') return;

  // Strip undefined entries — Plausible would serialize them as the
  // literal string "undefined" otherwise, polluting the stats UI.
  const cleaned = props
    ? Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined))
    : undefined;
  window.plausible(event, cleaned && Object.keys(cleaned).length > 0 ? { props: cleaned } : undefined);
}
