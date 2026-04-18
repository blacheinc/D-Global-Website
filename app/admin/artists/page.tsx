import Link from 'next/link';
import { db } from '@/server/db';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DeleteArtistButton } from '@/features/admin/components/DeleteArtistButton';

const PAGE_SIZE = 100;

export default async function AdminArtistsPage() {
  const [artists, total] = await Promise.all([
    db.artist.findMany({
      orderBy: { stageName: 'asc' },
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        stageName: true,
        featured: true,
        _count: { select: { releases: true, lineupSlots: true } },
      },
    }),
    db.artist.count(),
  ]);
  const clipped = total > artists.length;

  return (
    <div>
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Artists</h1>
          <p className="mt-2 text-sm text-muted">
            {clipped ? `Showing ${artists.length} of ${total}` : `${total} total`}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/artists/new">New artist</Link>
        </Button>
      </header>
      {artists.length === 0 ? (
        <p className="text-sm text-muted">No artists yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Stage name</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Releases</th>
                <th className="px-4 py-3 font-medium">Lineup slots</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {artists.map((a) => (
                <tr key={a.id} className="bg-bg/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/artists/${a.id}/edit`} className="font-medium hover:text-accent">
                      {a.stageName}
                    </Link>
                    {a.featured && <Badge className="ml-2">Featured</Badge>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{a.slug}</td>
                  <td className="px-4 py-3 text-muted">{a._count.releases}</td>
                  <td className="px-4 py-3 text-muted">{a._count.lineupSlots}</td>
                  <td className="px-4 py-3 text-right">
                    <DeleteArtistButton id={a.id} stageName={a.stageName} />
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
