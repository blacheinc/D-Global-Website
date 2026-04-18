import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { LineupForm } from '@/features/admin/components/LineupForm';
import { DeleteLineupButton } from '@/features/admin/components/DeleteLineupButton';
import { formatEventTime } from '@/lib/formatDate';

export const dynamic = 'force-dynamic';

export default async function AdminEventLineupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [event, artists] = await Promise.all([
    db.event.findUnique({
      where: { id },
      include: {
        lineup: { orderBy: { order: 'asc' }, include: { artist: true } },
      },
    }),
    db.artist.findMany({
      orderBy: { stageName: 'asc' },
      take: 100,
      select: { id: true, stageName: true },
    }),
  ]);
  if (!event) notFound();

  return (
    <div>
      <header className="mb-8">
        <Link
          href={`/admin/events/${id}/edit`}
          className="text-xs uppercase tracking-[0.18em] text-muted hover:text-foreground"
        >
          ← {event.title}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Lineup</h1>
        <p className="mt-2 text-sm text-muted">
          {event.lineup.length} slot{event.lineup.length === 1 ? '' : 's'}, ordered low-to-high.
        </p>
      </header>

      {event.lineup.length > 0 && (
        <div className="mb-10 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Order</th>
                <th scope="col" className="px-4 py-3 font-medium">Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Role</th>
                <th scope="col" className="px-4 py-3 font-medium">Slot</th>
                <th scope="col" className="px-4 py-3 font-medium">Artist</th>
                <th scope="col" className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {event.lineup.map((slot) => (
                <tr key={slot.id} className="bg-bg/50">
                  <td className="px-4 py-3 font-mono text-xs">{slot.order}</td>
                  <td className="px-4 py-3">{slot.displayName}</td>
                  <td className="px-4 py-3 text-muted">{slot.role ?? '-'}</td>
                  <td className="px-4 py-3 text-muted">
                    {slot.slotStart ? formatEventTime(slot.slotStart) : '-'}
                  </td>
                  <td className="px-4 py-3 text-muted">{slot.artist?.stageName ?? '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <DeleteLineupButton
                      eventId={id}
                      id={slot.id}
                      displayName={slot.displayName}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-surface p-6">
        <h2 className="text-lg font-semibold mb-4">Add a slot</h2>
        <LineupForm eventId={id} artists={artists} />
      </section>
    </div>
  );
}
