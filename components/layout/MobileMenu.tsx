'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { site } from '@/lib/site';
import { cn } from '@/lib/utils';

export function MobileMenu({ signedIn = false }: { signedIn?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);
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

  // The drawer is portalled to document.body so it escapes the header's
  // z-40 stacking context. Rendered inline, its z-30 would evaluate
  // INSIDE the header's context, making it stack above the logo and
  // toggle button (both at z-auto within the same parent) and hiding
  // them the moment the menu opened. Outside the header, the ordinary
  // z-index comparison works and the header floats on top of the drawer.
  const drawer = (
    <div
      id="mobile-menu"
      inert={!open}
      aria-hidden={!open}
      className={cn(
        'lg:hidden fixed inset-0 top-0 z-30 bg-background/70 backdrop-blur-2xl transition-opacity duration-300',
        open ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {/* Push nav below the fixed header so the first item isn't
          tucked behind the logo + toggle button. */}
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
        {signedIn && (
          // Same surface visibility as the desktop header: signed-in
          // users get a single tap to their membership + recent
          // tickets, no need to remember the URL.
          <Link
            href="/account"
            className="flex items-center justify-between border-b border-white/5 py-5 text-2xl font-display tracking-tight text-foreground hover:text-accent"
          >
            Account
            <span className="text-xs text-muted" aria-hidden>
              →
            </span>
          </Link>
        )}
      </nav>
    </div>
  );

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

      {/* createPortal requires a real DOM node, gate on mounted to
          avoid calling it during SSR. The drawer is hidden anyway until
          `open` toggles, so skipping it on the server render is fine. */}
      {mounted ? createPortal(drawer, document.body) : null}
    </>
  );
}
