// Shown while any /admin/* RSC is fetching its data (force-dynamic
// means every admin page hits the DB on navigation). The structure
// mirrors the common admin layout — a page header + a card/table
// region — so the skeleton-to-real transition doesn't shift layout.
// Tailwind's animate-pulse is the tell; exact dimensions don't need
// to match the real content perfectly, only the vertical rhythm.

export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <div className="mb-8">
        <div className="h-8 w-48 rounded-md bg-white/10" />
        <div className="mt-3 h-4 w-72 rounded-md bg-white/5" />
      </div>
      <div className="space-y-3">
        <div className="h-14 rounded-2xl border border-white/10 bg-white/[0.03]" />
        <div className="h-14 rounded-2xl border border-white/10 bg-white/[0.03]" />
        <div className="h-14 rounded-2xl border border-white/10 bg-white/[0.03]" />
        <div className="h-14 rounded-2xl border border-white/10 bg-white/[0.03]" />
        <div className="h-14 rounded-2xl border border-white/10 bg-white/[0.03]" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
