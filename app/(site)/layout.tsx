import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { StickyMobileBar } from '@/components/layout/StickyMobileBar';
import { PlausibleScript } from '@/components/analytics/PlausibleScript';

// Public-site chrome lives here, not in the root layout, so /admin/*
// doesn't inherit it. An admin on /admin/events shouldn't see the
// public nav, the WhatsApp sticky CTA, or fire Plausible pageviews that
// pollute the real-user analytics feed. Route groups (directories
// wrapped in parens) don't affect URLs — only layout composition.
//
// The skip-link + <main id="main"> land here too, since they're only
// meaningful when there's a public <Header> to skip past.

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-5 focus:py-3 focus:text-sm focus:text-white focus:shadow-glow-sm"
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
