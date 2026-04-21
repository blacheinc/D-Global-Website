import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { db } from '@/server/db';
import { LineupForm } from '@/features/admin/components/LineupForm';
import { DeleteLineupButton } from '@/features/admin/components/DeleteLineupButton';
import { formatEventTime } from '@/lib/formatDate';

export const dynamic = 'force-dynamic';

export default async function AdminEventLineupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;
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

  // `?edit=<id>` opens the bottom form in edit mode for that slot. On
  // successful save the form's onDone/router.refresh re-reads the page
  // without the param (admin navigates away or clicks "Add new" below).
  const editing = edit ? event.lineup.find((s) => s.id === edit) : undefined;

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
                <th scope="col" className="px-4 py-3 font-medium" />
                <th scope="col" className="px-4 py-3 font-medium">Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Role</th>
                <th scope="col" className="px-4 py-3 font-medium">Slot</th>
                <th scope="col" className="px-4 py-3 font-medium">Artist</th>
                <th scope="col" className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {event.lineup.map((slot) => {
                const thumb = slot.image ?? slot.artist?.avatar ?? null;
                return (
                  <tr key={slot.id} className="bg-bg/50">
                    <td className="px-4 py-3 font-mono text-xs">{slot.order}</td>
                    <td className="px-4 py-3">
                      <div className="relative h-10 w-10 overflow-hidden rounded-full border border-white/10 bg-elevated">
                        {thumb ? (
                          <Image src={thumb} alt="" aria-hidden fill sizes="40px" className="object-cover" />
                        ) : (
                          <div
                            aria-hidden
                            className="h-full w-full grid place-items-center text-muted text-xs uppercase"
                          >
                            {slot.displayName.charAt(0)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{slot.displayName}</td>
                    <td className="px-4 py-3 text-muted">{slot.role ?? '-'}</td>
                    <td className="px-4 py-3 text-muted">
                      {slot.slotStart ? formatEventTime(slot.slotStart) : '-'}
                    </td>
                    <td className="px-4 py-3 text-muted">{slot.artist?.stageName ?? '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          href={`/admin/events/${id}/lineup?edit=${slot.id}#edit`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
                          aria-label={`Edit ${slot.displayName}`}
                        >
                          <Pencil aria-hidden className="h-3.5 w-3.5" />
                        </Link>
                        <DeleteLineupButton
                          eventId={id}
                          id={slot.id}
                          displayName={slot.displayName}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section id="edit" className="rounded-2xl border border-white/10 bg-surface p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {editing ? `Edit ${editing.displayName}` : 'Add a slot'}
          </h2>
          {editing && (
            <Link
              href={`/admin/events/${id}/lineup`}
              className="text-xs uppercase tracking-[0.18em] text-muted hover:text-foreground"
            >
              + Add a new slot instead
            </Link>
          )}
        </div>
        {/* key forces a remount when switching between edit targets so
            defaultValue props pick up the new initial without stale form
            state from the previous row. */}
        <LineupForm
          key={editing?.id ?? 'new'}
          eventId={id}
          artists={artists}
          initial={editing ?? undefined}
        />
      </section>
    </div>
  );
}
