import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { site } from '@/lib/site';
import { MobileMenu } from './MobileMenu';

export function Header() {
  return (
    <header className="fixed top-0 inset-x-0 z-40 border-b border-white/5 bg-background/70 backdrop-blur-lg">
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
