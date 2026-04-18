import Link from 'next/link';
import { Instagram, Youtube } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { site } from '@/lib/site';
import { buildWaLink } from '@/lib/whatsapp';
import { env } from '@/lib/env';
import { SubscribeButton } from '@/components/push/SubscribeButton';

export function Footer() {
  return (
    <footer className="relative border-t border-white/5 bg-surface mt-20">
      <div className="container container-px py-14 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-2 space-y-4">
            <Logo size={40} />
            <p className="max-w-md text-sm text-muted leading-relaxed">
              {site.description}
            </p>
            <a
              href={buildWaLink('Hi D-Global, I have a question.')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent-hot"
            >
              Chat on WhatsApp
              <span aria-hidden>→</span>
            </a>
            <div className="pt-2">
              <SubscribeButton vapidPublicKey={env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
            </div>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-[0.22em] text-muted mb-4">Explore</h3>
            <ul className="space-y-3">
              {site.nav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-foreground/80 hover:text-foreground">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-[0.22em] text-muted mb-4">Follow</h3>
            <ul className="space-y-3">
              <li>
                <a href={site.socials.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-foreground/80 hover:text-foreground">
                  <Instagram className="h-4 w-4" /> Instagram
                </a>
              </li>
              <li>
                <a href={site.socials.youtube} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-foreground/80 hover:text-foreground">
                  <Youtube className="h-4 w-4" /> YouTube
                </a>
              </li>
              <li>
                <a href={`mailto:${site.contactEmail}`} className="text-sm text-foreground/80 hover:text-foreground">
                  {site.contactEmail}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-t border-white/5 pt-8">
          <p className="text-xs text-muted">
            © {new Date().getFullYear()} D-Global. All rights reserved. Accra, Ghana.
          </p>
          <div className="flex items-center gap-6 text-xs text-muted">
            <Link href="/about" className="hover:text-foreground">About</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
