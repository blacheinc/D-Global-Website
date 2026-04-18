import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { ReleaseForm } from '@/features/admin/components/ReleaseForm';

export default async function AdminReleaseNewPage() {
  const artists = await db.artist.findMany({
    orderBy: { stageName: 'asc' },
    take: 100,
    select: { id: true, stageName: true },
  });
  if (artists.length === 0) {
    // Releases require an artist — surface the dependency rather than
    // letting the operator fight a broken form.
    notFound();
  }
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">New release</h1>
        <p className="mt-2 text-sm text-muted">
          Add tracks from the edit page after you save.
        </p>
      </header>
      <ReleaseForm artists={artists} />
    </div>
  );
}
