import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { ArtistForm } from '@/features/admin/components/ArtistForm';

export const dynamic = 'force-dynamic';

export default async function AdminArtistEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const artist = await db.artist.findUnique({ where: { id } });
  if (!artist) notFound();
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Edit artist</h1>
        <p className="mt-2 text-sm text-muted">{artist.stageName}</p>
        <div className="mt-4 flex gap-4 text-xs uppercase tracking-[0.18em]">
          <Link
            href={`/artists/${artist.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-foreground"
          >
            View public ↗
          </Link>
        </div>
      </header>
      <ArtistForm initial={artist} />
    </div>
  );
}
