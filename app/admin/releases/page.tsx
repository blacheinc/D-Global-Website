import Link from 'next/link';
import { db } from '@/server/db';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DeleteReleaseButton } from '@/features/admin/components/DeleteReleaseButton';
import { paginate } from '@/lib/pagination';
import { Pagination } from '@/components/admin/Pagination';

const PAGE_SIZE = 50;

export default async function AdminReleasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const total = await db.release.count();
  const info = paginate(sp.page, total, PAGE_SIZE);
  const releases = await db.release.findMany({
    orderBy: { releasedAt: 'desc' },
    skip: info.skip,
    take: info.take,
    include: {
      artist: { select: { stageName: true } },
      _count: { select: { tracks: true } },
    },
  });

  return (
    <div>
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Releases</h1>
          <p className="mt-2 text-sm text-muted">{total} total</p>
        </div>
        <Button asChild>
          <Link href="/admin/releases/new">New release</Link>
        </Button>
      </header>
      {releases.length === 0 ? (
        <p className="text-sm text-muted">No releases yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Title</th>
                <th scope="col" className="px-4 py-3 font-medium">Artist</th>
                <th scope="col" className="px-4 py-3 font-medium">Kind</th>
                <th scope="col" className="px-4 py-3 font-medium">Released</th>
                <th scope="col" className="px-4 py-3 font-medium">Tracks</th>
                <th scope="col" className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {releases.map((r) => (
                <tr key={r.id} className="bg-bg/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/releases/${r.id}/edit`} className="font-medium hover:text-accent">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{r.artist.stageName}</td>
                  <td className="px-4 py-3">
                    <Badge>{r.kind}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {r.releasedAt.toLocaleDateString('en-GH')}
                  </td>
                  <td className="px-4 py-3 text-muted">{r._count.tracks}</td>
                  <td className="px-4 py-3 text-right">
                    <DeleteReleaseButton id={r.id} title={r.title} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination info={info} basePath="/admin/releases" searchParams={sp} />
    </div>
  );
}
