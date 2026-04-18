import Link from 'next/link';
import { db } from '@/server/db';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { DeletePackageButton } from '@/features/admin/components/DeletePackageButton';

export default async function AdminPackagesPage() {
  const packages = await db.package.findMany({
    orderBy: { priceMinor: 'asc' },
    include: { _count: { select: { bookings: true } } },
  });

  return (
    <div>
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">VIP packages</h1>
          <p className="mt-2 text-sm text-muted">{packages.length} configured.</p>
        </div>
        <Button asChild>
          <Link href="/admin/packages/new">New package</Link>
        </Button>
      </header>
      {packages.length === 0 ? (
        <p className="text-sm text-muted">No packages yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Max guests</th>
                <th className="px-4 py-3 font-medium">Bookings</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {packages.map((p) => (
                <tr key={p.id} className="bg-bg/50">
                  <td className="px-4 py-3 font-mono text-xs">{p.tier}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/packages/${p.id}/edit`} className="font-medium hover:text-accent">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{formatPriceMinor(p.priceMinor, p.currency)}</td>
                  <td className="px-4 py-3 text-muted">{p.maxGuests}</td>
                  <td className="px-4 py-3 text-muted">{p._count.bookings}</td>
                  <td className="px-4 py-3">
                    <Badge>{p.active ? 'Active' : 'Paused'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeletePackageButton id={p.id} name={p.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
