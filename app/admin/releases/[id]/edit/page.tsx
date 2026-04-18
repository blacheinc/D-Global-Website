import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { ReleaseForm } from '@/features/admin/components/ReleaseForm';
import { TrackForm } from '@/features/admin/components/TrackForm';
import { DeleteTrackButton } from '@/features/admin/components/DeleteReleaseButton';

export const dynamic = 'force-dynamic';

export default async function AdminReleaseEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [release, artists] = await Promise.all([
    db.release.findUnique({
      where: { id },
      include: { tracks: { orderBy: { order: 'asc' } } },
    }),
    db.artist.findMany({
      orderBy: { stageName: 'asc' },
      select: { id: true, stageName: true },
    }),
  ]);
  if (!release) notFound();
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Edit release</h1>
        <p className="mt-2 text-sm text-muted">{release.title}</p>
        <div className="mt-4 flex gap-4 text-xs uppercase tracking-[0.18em]">
          <Link
            href={`/releases/${release.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-foreground"
          >
            View public ↗
          </Link>
        </div>
      </header>
      <ReleaseForm artists={artists} initial={release} />

      <section className="mt-12 border-t border-white/10 pt-10">
        <h2 className="text-xl font-semibold mb-2">Tracks</h2>
        <p className="text-sm text-muted mb-6">Ordered low-to-high on the public release page.</p>

        {release.tracks.length > 0 && (
          <div className="mb-6 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Spotify</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {release.tracks.map((t) => (
                  <tr key={t.id} className="bg-bg/50">
                    <td className="px-4 py-3 font-mono text-xs">{t.order}</td>
                    <td className="px-4 py-3">{t.title}</td>
                    <td className="px-4 py-3 text-muted">
                      {t.durationSec ? `${Math.floor(t.durationSec / 60)}:${String(t.durationSec % 60).padStart(2, '0')}` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {t.spotifyId ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeleteTrackButton releaseId={id} id={t.id} title={t.title} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-surface p-6">
          <h3 className="font-semibold mb-4">Add a track</h3>
          <TrackForm releaseId={id} />
        </div>
      </section>
    </div>
  );
}
