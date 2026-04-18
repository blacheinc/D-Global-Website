import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { TicketTypeForm } from '@/features/admin/components/TicketTypeForm';
import { DeleteTicketTypeButton } from '@/features/admin/components/DeleteTicketTypeButton';

export const dynamic = 'force-dynamic';

export default async function AdminEventTicketsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await db.event.findUnique({
    where: { id },
    include: { ticketTypes: { orderBy: { priceMinor: 'asc' } } },
  });
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
                    <DeleteTicketTypeButton eventId={id} id={t.id} name={t.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-surface p-6">
        <h2 className="text-lg font-semibold mb-4">Add a tier</h2>
        <TicketTypeForm eventId={id} />
      </section>
    </div>
  );
}
