'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Ticket, Wine } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { buildWaLink } from '@/lib/whatsapp';

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
    <section className="relative h-[100svh] min-h-[640px] w-full overflow-hidden bg-background">
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
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
          videoReady ? 'opacity-60' : 'opacity-0'
        }`}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/brand/d-global-logo.png"
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
          <h1 className="mt-5 font-display text-display-2xl text-balance">
            Step <span className="text-accent">inside</span> the night.
          </h1>
          <p className="mt-5 text-lg md:text-xl text-muted max-w-xl leading-relaxed">
            Events, VIP tables, and the sound of a generation. D-Global is where the city comes
            alive after dark.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="primary" size="lg">
              <Link href="/events">
                <Ticket className="h-4 w-4" /> Get Tickets
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <a
                href={buildWaLink('Hi D-Global, I want to book a VIP table.')}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Wine className="h-4 w-4" /> Book a Table
              </a>
            </Button>
          </div>
        </motion.div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2 text-muted/60 z-10">
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
