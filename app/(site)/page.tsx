import { Suspense } from 'react';
import { VideoHero } from '@/features/home/VideoHero';
import { UpcomingEventsGrid } from '@/features/home/UpcomingEventsGrid';
import { VIPStrip } from '@/features/home/VIPStrip';
// ArtistCarouselSection is temporarily removed from the home page while
// the record-label side is paused. Re-import + re-mount below to restore.
// import { ArtistCarouselSection } from '@/features/home/ArtistCarouselSection';
import { GalleryPreview } from '@/features/home/GalleryPreview';
import { Skeleton } from '@/components/ui/Skeleton';

// Force a fresh DB read on every request. The home page surfaces
// admin-curated content (events, packages, artists, gallery) that
// changes whenever an admin publishes/edits/deletes. Default static
// rendering left rows that had been deleted via Prisma Studio (or any
// out-of-band edit that didn't run through the server actions'
// revalidatePath) visible until the next deploy. Force-dynamic is the
// safer default for a low-traffic content page; if traffic grows,
// switch to `revalidate = 60` for ISR.
export const dynamic = 'force-dynamic';

function SectionFallback() {
  return (
    <div className="container container-px section-y">
      <Skeleton className="h-10 w-64 mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <VideoHero />
      <Suspense fallback={<SectionFallback />}>
        <UpcomingEventsGrid />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <VIPStrip />
      </Suspense>
      {/* Artists section hidden while the record-label side is paused.
          <Suspense fallback={<SectionFallback />}>
            <ArtistCarouselSection />
          </Suspense> */}
      <Suspense fallback={<SectionFallback />}>
        <GalleryPreview />
      </Suspense>
    </>
  );
}
