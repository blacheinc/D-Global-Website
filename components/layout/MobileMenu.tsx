'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { site } from '@/lib/site';
import { cn } from '@/lib/utils';

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-foreground hover:bg-white/10"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div
        className={cn(
          'lg:hidden fixed inset-0 top-16 md:top-20 z-30 bg-background/95 backdrop-blur-xl transition-opacity duration-300',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <nav className="flex flex-col gap-2 px-6 pt-8" aria-label="Mobile">
          {site.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between border-b border-white/5 py-5 text-2xl font-display tracking-tight text-foreground hover:text-accent"
            >
              {item.label}
              <span className="text-xs text-muted">→</span>
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
