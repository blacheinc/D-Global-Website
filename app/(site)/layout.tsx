import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { StickyMobileBar } from '@/components/layout/StickyMobileBar';
import { PlausibleScript } from '@/components/analytics/PlausibleScript';

// Public-site chrome lives here, not in the root layout, so /admin/*
// doesn't inherit it. An admin on /admin/events shouldn't see the
// public nav, the WhatsApp sticky CTA, or fire Plausible pageviews that
// pollute the real-user analytics feed. Route groups (directories
// wrapped in parens) don't affect URLs, only layout composition.
//
// The skip-link + <main id="main"> land here too, since they're only
// meaningful when there's a public <Header> to skip past.

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {/* focus-visible keeps it off-screen for mouse clicks. Chrome
          still sometimes matches it after DevTools/tab-switch focus
          restoration, though, so we also position it BELOW the fixed
          header (top-20 = md header height) instead of over the logo.
          Worst case it briefly appears in a zone where it doesn't
          clash with the brand mark. */}
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-20 focus-visible:left-4 focus-visible:z-50 focus-visible:rounded-full focus-visible:bg-accent focus-visible:px-5 focus-visible:py-3 focus-visible:text-sm focus-visible:text-white focus-visible:shadow-glow-sm"
      >
        Skip to main content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="pt-16 md:pt-20 outline-none">
        {children}
      </main>
      <Footer />
      <StickyMobileBar />
      <PlausibleScript />
    </div>
  );
}
