import Link from 'next/link';
import { OrderStatus, Prisma } from '@prisma/client';
import { db } from '@/server/db';
import { Badge } from '@/components/ui/Badge';
import { formatEventDateTime } from '@/lib/formatDate';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { paginate } from '@/lib/pagination';
import { Pagination } from '@/components/admin/Pagination';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

// By default the dashboard shows only PAID orders, those are the
// actually-sold tickets operations care about. Pending/failed/expired
// rows are inventory noise (most are abandoned carts), but ops still
// occasionally need them (stuck-payment investigations, reconciling a
// webhook no-show). Pass ?status=all to see every row, or ?status=PENDING
// to drill into a specific bucket.

type StatusFilter = OrderStatus | 'ALL';

function parseFilter(raw: string | string[] | undefined): StatusFilter {
  const value = typeof raw === 'string' ? raw.toUpperCase() : '';
  if (value === 'ALL') return 'ALL';
  if ((Object.values(OrderStatus) as string[]).includes(value)) {
    return value as OrderStatus;
  }
  return 'PAID';
}

function parseQuery(raw: string | string[] | undefined): string {
  if (typeof raw !== 'string') return '';
  // Cap query length so a pasted novel can't balloon the Prisma payload
  // or tie up an OR scan. Reference is 35 chars; 100 gives full names +
  // email with slack.
  return raw.trim().slice(0, 100);
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = parseFilter(sp.status);
  const query = parseQuery(sp.q);

  // Build the where clause. Status filter is AND; the text search ORs
  // across the fields ops actually types into a search box, reference
  // (the dg_<hex> buyer quotes back), buyer name, email, phone, and
  // event title (a buyer says "I bought for Uncle Waffles"). `contains`
  // with mode:'insensitive' is fine at our volume; swap to a trigram
  // index or Postgres full-text if the table ever grows past a few
  // hundred thousand rows.
  const statusClause: Prisma.OrderWhereInput =
    filter === 'ALL' ? {} : { status: filter };
  const searchClause: Prisma.OrderWhereInput = query
    ? {
        OR: [
          { reference: { contains: query, mode: 'insensitive' } },
          { buyerName: { contains: query, mode: 'insensitive' } },
          { buyerEmail: { contains: query, mode: 'insensitive' } },
          { buyerPhone: { contains: query, mode: 'insensitive' } },
          { event: { title: { contains: query, mode: 'insensitive' } } },
          // Comp note is admin-only context (never shown to buyer);
          // searching it lets ops jump back to "Ama's birthday" or
          // "Pulse press review" by typing the keyword.
          { compNote: { contains: query, mode: 'insensitive' } },
        ],
      }
    : {};
  const where: Prisma.OrderWhereInput = { AND: [statusClause, searchClause] };

  const total = await db.order.count({ where });
  const info = paginate(sp.page, total, PAGE_SIZE);
  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: info.skip,
    take: info.take,
    include: {
      event: { select: { title: true } },
      items: { select: { quantity: true } },
    },
  });

  const tabs: ReadonlyArray<{ key: StatusFilter; label: string }> = [
    { key: 'PAID', label: 'Paid' },
    { key: 'REFUNDED', label: 'Refunded' },
    { key: 'PENDING', label: 'Pending' },
    { key: 'FAILED', label: 'Failed' },
    { key: 'EXPIRED', label: 'Expired' },
    { key: 'ALL', label: 'All' },
  ];

  // Build admin-orders hrefs that preserve the current filters. Used
  // by the status tabs (keeps the search query alive while flipping
  // buckets) and the clear-search link (keeps the current status).
  const buildHref = (opts: { status?: StatusFilter; q?: string }) => {
    const params = new URLSearchParams();
    const status = opts.status ?? filter;
    if (status !== 'PAID') params.set('status', status);
    if (opts.q) params.set('q', opts.q);
    const qs = params.toString();
    return qs ? `/admin/orders?${qs}` : '/admin/orders';
  };
  const tabHref = (key: StatusFilter) => buildHref({ status: key, q: query });

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-2 text-sm text-muted">
          {total} {filter === 'ALL' ? 'order' : `${filter.toLowerCase()} order`}
          {total === 1 ? '' : 's'}
          {query ? ` matching "${query}"` : ''}.
        </p>
      </header>

      {/* GET form so the search bookmarks / works without JS, and the
          browser back-button restores state cleanly. Hidden `status`
          input keeps the active tab when searching; entering a new
          query resets to page 1 by not carrying ?page. */}
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2" role="search">
        {filter !== 'PAID' && <input type="hidden" name="status" value={filter} />}
        <label htmlFor="admin-order-search" className="sr-only">
          Search orders
        </label>
        <input
          id="admin-order-search"
          type="search"
          name="q"
          defaultValue={query}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search reference, name, email, phone, event…"
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-surface px-4 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent/60"
        />
        <button
          type="submit"
          className="rounded-full bg-accent px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white hover:bg-accent-hot"
        >
          Search
        </button>
        {query && (
          <Link
            href={buildHref({})}
            className="rounded-full border border-white/10 bg-surface px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted hover:text-foreground hover:border-white/20"
          >
            Clear
          </Link>
        )}
      </form>

      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Filter orders by status">
        {tabs.map((tab) => {
          const active = tab.key === filter;
          return (
            <Link
              key={tab.key}
              href={tabHref(tab.key)}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'rounded-full bg-accent px-3 py-1 text-xs font-medium text-white'
                  : 'rounded-full border border-white/10 bg-surface px-3 py-1 text-xs text-muted hover:border-white/20 hover:text-foreground'
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {orders.length === 0 ? (
        <p className="text-sm text-muted">
          {query
            ? `No ${filter === 'ALL' ? '' : filter.toLowerCase() + ' '}orders match "${query}".`
            : filter === 'PAID'
              ? 'No paid orders yet.'
              : `No ${filter.toLowerCase()} orders.`}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Reference</th>
                <th scope="col" className="px-4 py-3 font-medium">Buyer</th>
                <th scope="col" className="px-4 py-3 font-medium">Event</th>
                <th scope="col" className="px-4 py-3 font-medium">Tickets</th>
                <th scope="col" className="px-4 py-3 font-medium">Total</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {orders.map((o) => (
                <tr key={o.id} className="bg-bg/50">
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    <Link href={`/admin/orders/${o.id}`} className="hover:text-accent">
                      {o.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div>{o.buyerName}</div>
                    <div className="text-xs text-muted">{o.buyerEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{o.event.title}</td>
                  <td className="px-4 py-3">{o.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                  <td className="px-4 py-3">{formatPriceMinor(o.totalMinor, o.currency)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge>{o.status}</Badge>
                      {o.isComplimentary && <Badge tone="accent">Comp</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatEventDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination info={info} basePath="/admin/orders" searchParams={sp} />
    </div>
  );
}
