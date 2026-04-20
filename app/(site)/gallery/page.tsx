import type { Metadata } from 'next';
import { db } from '@/server/db';
import { GalleryClient } from '@/features/gallery/components/GalleryClient';

export const metadata: Metadata = {
  title: 'Gallery',
  description: 'The nights, in frames. Events, backstage, artists and venue photography.',
};

// Same rationale as app/(site)/page.tsx.
export const dynamic = 'force-dynamic';

export default async function GalleryPage() {
  const images = await db.galleryImage.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
  });
  return (
    <section className="container-px py-14 md:py-20">
      <div className="max-w-3xl">
        <p className="eyebrow">Gallery</p>
        <h1 className="mt-4 font-display text-display-xl text-balance">The nights, in frames.</h1>
        <p className="mt-4 text-muted md:text-lg max-w-xl">
          A living archive of every edition, tap any photo to view it full-screen.
        </p>
      </div>
      <div className="mt-12">
        <GalleryClient images={images} />
      </div>
    </section>
  );
}
