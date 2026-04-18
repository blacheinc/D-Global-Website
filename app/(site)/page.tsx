import { Suspense } from 'react';
import { VideoHero } from '@/features/home/VideoHero';
import { UpcomingEventsGrid } from '@/features/home/UpcomingEventsGrid';
import { VIPStrip } from '@/features/home/VIPStrip';
import { ArtistCarouselSection } from '@/features/home/ArtistCarouselSection';
import { GalleryPreview } from '@/features/home/GalleryPreview';
import { Skeleton } from '@/components/ui/Skeleton';

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
      <Suspense fallback={<SectionFallback />}>
        <ArtistCarouselSection />
      </Suspense>
      <Suspense fallback={<SectionFallback />}>
        <GalleryPreview />
      </Suspense>
    </>
  );
}
