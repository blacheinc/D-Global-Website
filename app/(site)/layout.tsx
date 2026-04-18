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
    <div className="pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pb-0">
      {/* focus-visible: only triggers on keyboard focus, not on
          programmatic focus restoration (DevTools tab-switch, page
          restore, etc.) or mouse clicks. Using plain focus: here made
          the skip link pop over the logo any time focus was restored
          to the document without a clear keyboard action. */}
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4 focus-visible:z-50 focus-visible:rounded-full focus-visible:bg-accent focus-visible:px-5 focus-visible:py-3 focus-visible:text-sm focus-visible:text-white focus-visible:shadow-glow-sm"
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
