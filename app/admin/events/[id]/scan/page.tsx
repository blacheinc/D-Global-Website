import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { env } from '@/lib/env';
import { formatEventDateTime } from '@/lib/formatDate';
import { ScanTokenForm } from '@/features/admin/components/ScanTokenForm';
import { RevokeScanTokenButton } from '@/features/admin/components/RevokeScanTokenButton';
import { CopyScanLink } from '@/features/admin/components/CopyScanLink';

export const dynamic = 'force-dynamic';

export default async function AdminEventScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await db.event.findUnique({
    where: { id },
    include: {
      scanTokens: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!event) notFound();

  // Every row's URL is computed here so the UI is a pure consumer of
  // one source of truth (NEXT_PUBLIC_SITE_URL). Avoids scattering
  // `window.location.origin` across client components that'd get it
  // wrong during SSR.
  const base = env.NEXT_PUBLIC_SITE_URL;

  return (
    <div>
      <header className="mb-8">
        <Link
          href={`/admin/events/${id}/edit`}
          className="text-xs uppercase tracking-[0.18em] text-muted hover:text-foreground"
        >
          ← {event.title}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Scanner links</h1>
        <p className="mt-2 text-sm text-muted max-w-xl">
          Share these links with gate crew to validate tickets at the door. Each link opens a
          camera-based QR scanner. Revoke a link to stop it working without affecting others.
        </p>
      </header>

      {event.scanTokens.length > 0 && (
        <div className="mb-10 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-[0.18em] text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Label</th>
                <th scope="col" className="px-4 py-3 font-medium">URL</th>
                <th scope="col" className="px-4 py-3 font-medium">Created</th>
                <th scope="col" className="px-4 py-3 font-medium">Expires</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {event.scanTokens.map((t) => {
                const url = `${base}/scan/${t.token}`;
                const expired = t.expiresAt ? t.expiresAt.getTime() < Date.now() : false;
                const status = t.revokedAt
                  ? 'Revoked'
                  : expired
                    ? 'Expired'
                    : 'Active';
                return (
                  <tr key={t.id} className="bg-bg/50">
                    <td className="px-4 py-3">{t.label ?? <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-mono text-xs">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate max-w-[260px] text-muted hover:text-foreground"
                        >
                          /scan/{t.token.slice(0, 10)}…
                        </a>
                        <CopyScanLink url={url} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">{formatEventDateTime(t.createdAt)}</td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {t.expiresAt ? formatEventDateTime(t.expiresAt) : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          status === 'Active'
                            ? 'inline-flex rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]'
                            : 'inline-flex rounded-full bg-white/5 text-muted px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]'
                        }
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!t.revokedAt && !expired && (
                        <RevokeScanTokenButton eventId={id} id={t.id} label={t.label} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-surface p-6 max-w-2xl">
        <h2 className="text-lg font-semibold mb-4">Generate a new scanner link</h2>
        <ScanTokenForm eventId={id} />
      </section>
    </div>
  );
}
