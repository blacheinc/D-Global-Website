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
  const [img, recentEvents] = await Promise.all([
    db.galleryImage.findUnique({ where: { id } }),
    db.event.findMany({
      orderBy: { startsAt: 'desc' },
      take: 100,
      select: { id: true, title: true },
    }),
  ]);
  if (!img) notFound();
  // Same concern as the Release edit page: if the gallery image links
  // to an older event that's not in the 100-most-recent slice, it'd
  // silently fall out of the dropdown and the admin could clear the
  // association on save. Merge the linked event in if missing.
  const currentEvent =
    img.eventId && !recentEvents.some((e) => e.id === img.eventId)
      ? await db.event.findUnique({
          where: { id: img.eventId },
          select: { id: true, title: true },
        })
      : null;
  const events = currentEvent ? [...recentEvents, currentEvent] : recentEvents;
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
