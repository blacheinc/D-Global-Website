'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Artist } from '@prisma/client';

interface ArtistCarouselProps {
  artists: Artist[];
}

export function ArtistCarousel({ artists }: ArtistCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: 'start',
    dragFree: true,
    slidesToScroll: 1,
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

  return (
    <div className="relative">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-4 md:gap-6">
          {artists.map((a) => (
            <Link
              key={a.id}
              href={`/artists/${a.slug}`}
              className="group shrink-0 basis-[260px] md:basis-[320px]"
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/5 bg-surface card-lift">
                {a.heroImage ? (
                  <Image
                    src={a.heroImage}
                    alt=""
                    aria-hidden
                    fill
                    sizes="320px"
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-accent">Artist</p>
                  <h3 className="mt-1 font-display text-2xl leading-tight">{a.stageName}</h3>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          aria-label="Previous"
          onClick={() => emblaApi?.scrollPrev()}
          disabled={!canPrev}
          className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40"
        >
          <ChevronLeft aria-hidden className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Next"
          onClick={() => emblaApi?.scrollNext()}
          disabled={!canNext}
          className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40"
        >
          <ChevronRight aria-hidden className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
