'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import { GalleryCategory, type GalleryImage } from '@prisma/client';
import { cn } from '@/lib/utils';

const CATEGORIES: Array<{ value: GalleryCategory | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: GalleryCategory.EVENTS, label: 'Events' },
  { value: GalleryCategory.BACKSTAGE, label: 'Backstage' },
  { value: GalleryCategory.ARTISTS, label: 'Artists' },
  { value: GalleryCategory.VENUE, label: 'Venue' },
  { value: GalleryCategory.CAMPAIGN, label: 'Campaign' },
];

interface GalleryClientProps {
  images: GalleryImage[];
}

export function GalleryClient({ images }: GalleryClientProps) {
  const [category, setCategory] = useState<GalleryCategory | 'ALL'>('ALL');
  const [index, setIndex] = useState(-1);

  const filtered = useMemo(
    () => (category === 'ALL' ? images : images.filter((i) => i.category === category)),
    [images, category],
  );

  const slides = filtered.map((i) => ({
    src: i.url,
    alt: i.caption ?? 'D-Global',
    description: i.caption ?? undefined,
  }));

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(c.value)}
            className={cn(
              'rounded-full px-4 py-2 text-xs uppercase tracking-[0.22em] border transition-colors',
              category === c.value
                ? 'border-accent bg-accent/15 text-foreground'
                : 'border-white/10 bg-white/5 text-muted hover:text-foreground',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setIndex(i)}
            className="group relative aspect-[4/5] overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Image
              src={img.url}
              alt={img.caption ?? 'D-Global'}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            {img.caption && (
              <div className="absolute inset-x-0 bottom-0 p-3 text-xs text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                {img.caption}
              </div>
            )}
          </button>
        ))}
      </div>

      <Lightbox
        open={index >= 0}
        index={Math.max(0, index)}
        close={() => setIndex(-1)}
        slides={slides}
        styles={{
          container: { backgroundColor: 'rgba(0,0,0,0.95)' },
        }}
      />

      {filtered.length === 0 && (
        <p className="text-center text-muted py-20">Nothing here yet. Check back after the next night.</p>
      )}
    </div>
  );
}
