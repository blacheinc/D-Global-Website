import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { db } from '@/server/db';
import { Reveal } from '@/components/motion/Reveal';

export async function GalleryPreview() {
  const images = await db.galleryImage.findMany({
    where: { featured: true },
    orderBy: { order: 'asc' },
    take: 6,
  });
  if (images.length === 0) return null;

  return (
    <section className="container container-px section-y">
      <Reveal>
        <div className="flex items-end justify-between gap-6 flex-wrap mb-10">
          <div>
            <p className="eyebrow">Gallery</p>
            <h2 className="mt-4 font-display text-display-xl text-balance">The nights, in frames.</h2>
          </div>
          <Link
            href="/gallery"
            className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent-hot"
          >
            Full gallery <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {images.map((img, i) => (
          <Reveal key={img.id} delay={i * 0.05}>
            <Link href="/gallery" className="relative block aspect-[4/5] overflow-hidden rounded-xl group">
              <Image
                src={img.url}
                alt={img.caption ?? 'D-Global night'}
                fill
                sizes="(min-width: 768px) 33vw, 50vw"
                className="object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
