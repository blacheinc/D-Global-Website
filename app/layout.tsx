import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { StickyMobileBar } from '@/components/layout/StickyMobileBar';
import { site } from '@/lib/site';
import { brand } from '@/lib/brand';
import { env } from '@/lib/env';
import './globals.css';

const atypDisplay = localFont({
  src: [
    { path: '../fonts/AtypDisplay-Light.ttf', weight: '300', style: 'normal' },
    { path: '../fonts/AtypDisplay-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../fonts/AtypDisplay-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../fonts/AtypDisplay-Semibold.ttf', weight: '600', style: 'normal' },
    { path: '../fonts/AtypDisplay-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
});

const atypText = localFont({
  src: [
    { path: '../fonts/AtypText-Light.ttf', weight: '300', style: 'normal' },
    { path: '../fonts/AtypText-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../fonts/AtypText-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../fonts/AtypText-Semibold.ttf', weight: '600', style: 'normal' },
    { path: '../fonts/AtypText-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    siteName: site.name,
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    locale: 'en_GH',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
  },
};

export const viewport: Viewport = {
  themeColor: brand.bg,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${atypDisplay.variable} ${atypText.variable}`}>
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-5 focus:py-3 focus:text-sm focus:text-white focus:shadow-glow-sm"
        >
          Skip to main content
        </a>
        <Header />
        <main id="main" tabIndex={-1} className="pt-16 md:pt-20 pb-20 md:pb-0 outline-none">
          {children}
        </main>
        <Footer />
        <StickyMobileBar />
      </body>
    </html>
  );
}
