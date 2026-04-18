'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// Client wrapper around the admin side-nav so the active route stays
// highlighted. Small enough to live in a Client Component without
// flipping the layout itself — the layout stays a Server Component
// (needs requireAdmin), and this one just reads the current pathname.

export type AdminNavItem = { href: string; label: string };

// Match the current path against each nav entry. The root /admin only
// highlights for exactly /admin (not every /admin/* subpage); every
// other entry highlights when the path starts with its href (so
// /admin/events/[id]/edit still lights up "Events").
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ items }: { items: ReadonlyArray<AdminNavItem> }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1" aria-label="Admin navigation">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'block rounded-lg px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-accent/15 text-accent'
                : 'text-muted hover:bg-white/5 hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
