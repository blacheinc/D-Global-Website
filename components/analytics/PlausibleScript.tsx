import Script from 'next/script';
import { env } from '@/lib/env';

// Renders the Plausible analytics script only when a domain is configured.
// `afterInteractive` is the right strategy for a tracking script: it loads
// after hydration so it never blocks first paint, and Plausible's queue
// shim means events fired before the script arrives are still recorded.

export function PlausibleScript() {
  const domain = env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return null;
  return (
    <>
      <Script
        src={env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL}
        data-domain={domain}
        strategy="afterInteractive"
        defer
      />
      <Script id="plausible-init" strategy="afterInteractive">
        {`window.plausible = window.plausible || function() { (window.plausible.q = window.plausible.q || []).push(arguments) }`}
      </Script>
    </>
  );
}
