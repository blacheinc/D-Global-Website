import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { site } from '@/lib/site';
import { MobileMenu } from './MobileMenu';

export function Header() {
  return (
    // No opaque panel + border, so the hero video bleeds up behind the
    // fixed header instead of cutting off at a hard line. A soft vertical
    // scrim (dark at the very top, fading to transparent at the bottom of
    // the bar) keeps the logo/nav readable over bright video frames; on
    // non-hero pages it fades into the solid black body, effectively
    // invisible. Backdrop-blur would smear the gradient's transparent
    // edge, so it's intentionally dropped.
    <header className="fixed top-0 inset-x-0 z-40 bg-gradient-to-b from-background/80 via-background/40 to-transparent">
      <div className="container flex h-16 md:h-20 items-center justify-between container-px">
        <Logo size={36} />

        <nav className="hidden lg:flex items-center gap-8" aria-label="Primary">
          {site.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/bookings">Book Table</Link>
          </Button>
          <Button asChild variant="primary" size="sm">
            <Link href="/events">Get Tickets</Link>
          </Button>
        </div>

        <MobileMenu />
      </div>
    </header>
  );
}
