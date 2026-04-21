import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { db } from '@/server/db';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { TicketTypeForm } from '@/features/admin/components/TicketTypeForm';
import { DeleteTicketTypeButton } from '@/features/admin/components/DeleteTicketTypeButton';

export const dynamic = 'force-dynamic';

export default async function AdminEventTicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;
  const event = await db.event.findUnique({
    where: { id },
    include: { ticketTypes: { orderBy: { priceMinor: 'asc' } } },
  });
  if (!event) notFound();

  // `?edit=<tierId>` opens the bottom form in edit mode for that tier.
  const editing = edit ? event.ticketTypes.find((t) => t.id === edit) : undefined;

  return (
    <div>
      <header className="mb-8">
        <Link
          href={`/admin/events/${id}/edit`}
          className="text-xs uppercase tracking-[0.18em] text-muted hover:text-foreground"
        >
          ← {event.title}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Ticket tiers</h1>
        <p className="mt-2 text-sm text-muted">
          {event.ticketTypes.length} tier{event.ticketTypes.length === 1 ? '' : 's'} configured.
        </p>
      </header>

      {event.ticketTypes.length > 0 && (
        <div className="mb-10 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Tier</th>
                <th scope="col" className="px-4 py-3 font-medium">Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Price</th>
                <th scope="col" className="px-4 py-3 font-medium">Sold / Quota</th>
                <th scope="col" className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {event.ticketTypes.map((t) => (
                <tr key={t.id} className="bg-bg/50">
                  <td className="px-4 py-3 font-mono text-xs">{t.tier.replace('_', ' ')}</td>
                  <td className="px-4 py-3">{t.name}</td>
                  <td className="px-4 py-3">{formatPriceMinor(t.priceMinor, t.currency)}</td>
                  <td className="px-4 py-3 text-muted">
                    {t.sold} / {t.quota}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Link
                        href={`/admin/events/${id}/tickets?edit=${t.id}#edit`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
                        aria-label={`Edit ${t.name}`}
                      >
                        <Pencil aria-hidden className="h-3.5 w-3.5" />
                      </Link>
                      <DeleteTicketTypeButton eventId={id} id={t.id} name={t.name} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section id="edit" className="rounded-2xl border border-white/10 bg-surface p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {editing ? `Edit ${editing.name}` : 'Add a tier'}
          </h2>
          {editing && (
            <Link
              href={`/admin/events/${id}/tickets`}
              className="text-xs uppercase tracking-[0.18em] text-muted hover:text-foreground"
            >
              + Add a new tier instead
            </Link>
          )}
        </div>
        {/* key remounts the form when switching edit targets so stale
            DOM values from the previous row don't leak into the new
            defaultValues. */}
        <TicketTypeForm
          key={editing?.id ?? 'new'}
          eventId={id}
          initial={editing ?? undefined}
        />
      </section>
    </div>
  );
}
