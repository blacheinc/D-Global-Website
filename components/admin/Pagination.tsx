import Link from 'next/link';
import type { PageInfo } from '@/lib/pagination';

// Prev / page indicator / Next. Pure server component, no interactivity
// beyond Next's `<Link>` prefetch. Uses `rel="prev"`/`rel="next"` for
// correct crawler semantics and `aria-current` for screen readers.
//
// Renders nothing when there's only one page; the caller doesn't need
// to guard. The `basePath` is the list URL without the query string;
// we rebuild ?page= on each link so other query params on the admin
// list (future filters) aren't clobbered by passing a `searchParams`
// object instead of just the base.

export function Pagination({
  info,
  basePath,
  searchParams,
}: {
  info: PageInfo;
  basePath: string;
  // Next's searchParams type is `Record<string, string | string[] |
  // undefined>`. Admin URLs don't use array params (duplicate keys in
  // the URL), but accept the wider type so callers can hand it
  // straight through without narrowing, we just skip arrays.
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  if (info.totalPages <= 1) return null;

  const makeHref = (page: number) => {
    const params = new URLSearchParams();
    if (searchParams) {
      for (const [k, v] of Object.entries(searchParams)) {
        if (k === 'page') continue;
        if (typeof v === 'string' && v) params.set(k, v);
      }
    }
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const prevPage = info.page > 1 ? info.page - 1 : null;
  const nextPage = info.page < info.totalPages ? info.page + 1 : null;

  // Shared classes: baseline pill + disabled appearance when no target.
  const pill =
    'inline-flex items-center rounded-full border border-white/10 bg-surface px-4 py-2 text-xs uppercase tracking-[0.18em] text-muted transition-colors';
  const active = 'hover:bg-white/10 hover:text-foreground hover:border-white/20';
  const inactive = 'opacity-40 pointer-events-none';

  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex items-center justify-between gap-3 text-xs"
    >
      <div className="text-muted">
        Page {info.page} of {info.totalPages}
        <span className="mx-2 opacity-40">·</span>
        {info.total.toLocaleString('en-GH')} total
      </div>
      <div className="flex items-center gap-2">
        {prevPage ? (
          <Link
            rel="prev"
            href={makeHref(prevPage)}
            className={`${pill} ${active}`}
            aria-label="Previous page"
          >
            ← Prev
          </Link>
        ) : (
          <span className={`${pill} ${inactive}`} aria-hidden>
            ← Prev
          </span>
        )}
        {nextPage ? (
          <Link
            rel="next"
            href={makeHref(nextPage)}
            className={`${pill} ${active}`}
            aria-label="Next page"
          >
            Next →
          </Link>
        ) : (
          <span className={`${pill} ${inactive}`} aria-hidden>
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
