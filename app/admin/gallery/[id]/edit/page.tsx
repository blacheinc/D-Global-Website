import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { GalleryImageForm } from '@/features/admin/components/GalleryImageForm';

export const dynamic = 'force-dynamic';

export default async function AdminGalleryEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [img, events] = await Promise.all([
    db.galleryImage.findUnique({ where: { id } }),
    db.event.findMany({
      orderBy: { startsAt: 'desc' },
      take: 100,
      select: { id: true, title: true },
    }),
  ]);
  if (!img) notFound();
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Edit gallery image</h1>
        <p className="mt-2 text-sm text-muted">{img.caption ?? 'Untitled'}</p>
      </header>
      <GalleryImageForm events={events} initial={img} />
    </div>
  );
}
