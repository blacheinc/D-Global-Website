// Analytics stub. Swap for Plausible / PostHog / GA later.
type Props = Record<string, string | number | boolean | null | undefined>;

export function track(event: string, props?: Props): void {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', event, props ?? {});
  }
}
