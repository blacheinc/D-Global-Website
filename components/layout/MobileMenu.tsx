'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { site } from '@/lib/site';
import { cn } from '@/lib/utils';

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((v) => !v)}
        className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-foreground hover:bg-white/10"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div
        id="mobile-menu"
        inert={!open}
        aria-hidden={!open}
        className={cn(
          // Full-viewport drawer (top-0, not top-16). The transparent
          // header sits ON this panel at z-40, so the menu reads as one
          // continuous glass surface instead of a card with a strip of
          // hero video peeking above it. bg-background/70 + heavy
          // backdrop-blur gives the "frosted glass over whatever was
          // behind" effect — opaque enough for nav text to stay high-
          // contrast, transparent enough to feel like a modern drawer
          // and not a solid black wall.
          'lg:hidden fixed inset-0 top-0 z-30 bg-background/70 backdrop-blur-2xl transition-opacity duration-300',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {/* Push nav below the fixed header so the first item isn't
            tucked behind the logo + close button. */}
        <nav className="flex flex-col gap-2 px-6 pt-24 md:pt-28" aria-label="Mobile">
          {site.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between border-b border-white/5 py-5 text-2xl font-display tracking-tight text-foreground hover:text-accent"
            >
              {item.label}
              <span className="text-xs text-muted" aria-hidden>
                →
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
