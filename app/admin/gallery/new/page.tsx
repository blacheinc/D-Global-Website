import { db } from '@/server/db';
import { GalleryImageForm } from '@/features/admin/components/GalleryImageForm';

export default async function AdminGalleryNewPage() {
  const events = await db.event.findMany({
    orderBy: { startsAt: 'desc' },
    take: 100,
    select: { id: true, title: true },
  });
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Upload image</h1>
        <p className="mt-2 text-sm text-muted">
          Images land on /gallery and can optionally link to an event.
        </p>
      </header>
      <GalleryImageForm events={events} />
    </div>
  );
}
