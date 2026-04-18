import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/server/auth';
import { signOut } from '@/auth';
import { site } from '@/lib/site';

// All /admin routes share this layout. requireAdmin() runs on every
// request — there's no edge middleware in front because the Email
// provider's verify step needs Node-runtime DB access. The redirect on
// failure is the entire access control.
//
// `force-dynamic` because the dashboard reads live data and a cached
// shell could surface another admin's session info.

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

const NAV: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/push', label: 'Push' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // requireAdmin() also tags the per-request Sentry scope with the admin's
  // identity, so every error raised below this layout — including those
  // from server actions — carries the user.
  const user = await requireAdmin();
  return (
    <div className="min-h-screen bg-bg text-foreground">
      <div className="mx-auto grid max-w-screen-2xl grid-cols-1 gap-0 lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-white/10 bg-surface px-6 py-6 lg:min-h-screen lg:border-b-0 lg:border-r">
          <div className="mb-8">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              {site.name}
            </Link>
            <p className="mt-1 text-xs uppercase tracking-[0.22em] text-muted">Admin</p>
          </div>
          <nav className="space-y-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="text-xs text-muted truncate">{user.email}</p>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/' });
              }}
              className="mt-3"
            >
              <button
                type="submit"
                className="text-xs uppercase tracking-[0.18em] text-muted hover:text-foreground transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </aside>
        <main className="px-6 py-10 lg:px-12">{children}</main>
      </div>
    </div>
  );
}
