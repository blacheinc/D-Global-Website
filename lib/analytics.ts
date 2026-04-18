// Lightweight Plausible wrapper. Calls window.plausible when the script
// has been loaded; otherwise no-ops. The script is rendered conditionally
// from <PlausibleScript /> in the root layout — if the env domain is
// blank (dev, previews, self-hosted without analytics), there's no
// global to call and we silently skip. Server callers also no-op since
// `window` is undefined there.

type Props = Record<string, string | number | boolean | null | undefined>;

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
  if (typeof window.plausible === 'function') {
    window.plausible(event, props ? { props } : undefined);
  }
}
