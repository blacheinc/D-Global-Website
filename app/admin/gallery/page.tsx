import Link from 'next/link';
import { db } from '@/server/db';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DeleteGalleryButton } from '@/features/admin/components/DeleteGalleryButton';
import { paginate } from '@/lib/pagination';
import { Pagination } from '@/components/admin/Pagination';

const PAGE_SIZE = 48; // 48 keeps the grid tidy across the common breakpoints.

export default async function AdminGalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const total = await db.galleryImage.count();
  const info = paginate(sp.page, total, PAGE_SIZE);
  const images = await db.galleryImage.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    skip: info.skip,
    take: info.take,
    include: { event: { select: { title: true } } },
  });

  return (
    <div>
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Gallery</h1>
          <p className="mt-2 text-sm text-muted">{total} total</p>
        </div>
        <Button asChild>
          <Link href="/admin/gallery/new">Upload image</Link>
        </Button>
      </header>
      {images.length === 0 ? (
        <p className="text-sm text-muted">No images yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img) => (
            <div key={img.id} className="rounded-2xl border border-white/10 bg-surface p-3">
              {/* Plain img so we don't have to add every possible upload origin to next.config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.caption ?? ''}
                loading="lazy"
                decoding="async"
                className="aspect-square w-full rounded-lg object-cover"
              />
              <div className="mt-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{img.caption ?? 'Untitled'}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <Badge tone="muted">{img.category}</Badge>
                    {img.featured && <Badge>Featured</Badge>}
                  </p>
                  {img.event && (
                    <p className="mt-1 truncate text-xs text-muted">→ {img.event.title}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <Link
                  href={`/admin/gallery/${img.id}/edit`}
                  className="text-xs uppercase tracking-[0.18em] text-accent hover:text-accent-hot"
                >
                  Edit
                </Link>
                <DeleteGalleryButton id={img.id} caption={img.caption} />
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination info={info} basePath="/admin/gallery" searchParams={sp} />
    </div>
  );
}
