import type { Metadata } from 'next';
import Image from 'next/image';
import { Reveal } from '@/components/motion/Reveal';

export const metadata: Metadata = {
  title: 'About',
  description: 'D Global Entertainment is a nightlife and record label platform based in Accra.',
};

export default function AboutPage() {
  return (
    <section className="container-px py-14 md:py-24">
      <div className="max-w-3xl">
        <p className="eyebrow">About</p>
        <h1 className="mt-4 font-display text-display-xl text-balance">
          We throw the nights we wanted to go to.
        </h1>
        <p className="mt-6 text-muted md:text-lg leading-relaxed">
          D Global Entertainment is a nightlife and record label platform headquartered in Accra. We build event
          experiences, sign artists, and operate the flagship venues where the next wave of West
          African sound is being shaped.
        </p>
        <p className="mt-4 text-muted leading-relaxed">
          The mission is simple: make the night feel as good in person as it does in a film. Every
          room we open is tuned for the sound first. Every ticket we sell is a ticket to something
          we'd show up to ourselves.
        </p>
      </div>

      <Reveal>
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {[
            ['02', 'Cities', 'Accra · Kumasi'],
            ['18', 'Events produced', 'Since inception'],
            ['04', 'Resident artists', 'On the label'],
          ].map(([n, k, v]) => (
            <div key={k} className="rounded-2xl border border-white/5 bg-surface p-6">
              <p className="font-display text-display-lg text-accent">{n}</p>
              <p className="mt-2 text-sm uppercase tracking-[0.22em] text-muted">{k}</p>
              <p className="mt-1 text-foreground">{v}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal>
        <div className="mt-16 relative aspect-[16/9] overflow-hidden rounded-2xl border border-white/5">
          <Image
            src="/brand/dglobal-logo.png"
            alt=""
            fill
            aria-hidden
            className="object-contain opacity-20"
          />
        </div>
      </Reveal>
    </section>
  );
}
