'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Ticket, Wine } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function VideoHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    const v = videoRef.current;
    if (!v || prefersReduced) return;
    v.play().catch(() => {
      // ignore autoplay failure
    });
  }, [prefersReduced]);

  return (
    // -mt-16 / md:-mt-20 cancels the main element's top padding (which
    // exists to keep normal pages clear of the fixed header) so the hero
    // starts at the very top of the viewport. The transparent-gradient
    // header then sits ON TOP of the video, and the brand-logo watermark
    // + video itself bleed into the header area for a seamless edge.
    <section className="relative -mt-16 md:-mt-20 h-[100svh] min-h-[640px] w-full overflow-hidden bg-background">
      <div className="absolute inset-0">
        <Image
          src="/brand/d-global-logo.png"
          alt=""
          fill
          priority
          aria-hidden
          className="object-contain opacity-[0.07] scale-[1.6] mix-blend-screen"
        />
      </div>

      <video
        ref={videoRef}
        aria-hidden
        tabIndex={-1}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
          videoReady ? 'opacity-60' : 'opacity-0'
        }`}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onCanPlay={() => setVideoReady(true)}
        onError={() => setVideoReady(false)}
      >
        <source src="/videos/hero.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background" />
      <div className="absolute inset-x-0 top-0 h-2/3 gradient-radial-red opacity-80" />
      <div className="absolute inset-0 bg-noise opacity-40 mix-blend-overlay" />

      <div className="relative z-10 h-full container container-px flex flex-col justify-end pb-[18vh] md:pb-32">
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}
          className="max-w-4xl"
        >
          <p className="eyebrow">Accra · Nightlife</p>
          <h1 className="mt-5 font-display text-[clamp(2.75rem,6vw,5.5rem)] leading-[1] tracking-[-0.02em] font-semibold text-balance">
            Step <span className="text-accent">inside</span> the night.
          </h1>
          <p className="mt-5 text-lg md:text-xl text-muted max-w-lg leading-relaxed">
            Events and VIP tables in the city after dark.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="primary" size="lg">
              <Link href="/events">
                <Ticket aria-hidden className="h-4 w-4" /> Get Tickets
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/bookings">
                <Wine aria-hidden className="h-4 w-4" /> Book a Table
              </Link>
            </Button>
          </div>
        </motion.div>
      </div>

      <div
        aria-hidden
        className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2 text-muted/60 z-10"
      >
        <span className="text-[10px] uppercase tracking-[0.3em]">Scroll</span>
        <motion.span
          animate={prefersReduced ? {} : { y: [0, 6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="h-6 w-px bg-gradient-to-b from-muted/60 to-transparent"
        />
      </div>
    </section>
  );
}
