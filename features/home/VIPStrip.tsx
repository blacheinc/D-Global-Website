import Link from 'next/link';
import { Wine } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { db } from '@/server/db';
import { formatPriceMinor } from '@/lib/formatCurrency';
import { Reveal } from '@/components/motion/Reveal';

export async function VIPStrip() {
  const packages = await db.package.findMany({
    where: { active: true },
    orderBy: { priceMinor: 'asc' },
  });

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-accent-deep via-background to-accent-deep opacity-40"
      />
      <div className="absolute inset-0 bg-noise opacity-50 mix-blend-overlay" aria-hidden />
      <div className="relative container container-px section-y">
        <Reveal>
          <div className="flex items-end justify-between gap-6 flex-wrap mb-12">
            <div className="max-w-2xl">
              <p className="eyebrow">VIP Tables</p>
              <h2 className="mt-4 font-display text-display-xl text-balance">
                Own the night in a private suite.
              </h2>
              <p className="mt-3 text-muted md:text-lg">
                Table-side service, premium bottles, and the best sightlines in the room. Reserve
                from Silver to Platinum.
              </p>
            </div>
            <Button asChild variant="primary" size="lg">
              <Link href="/bookings">
                <Wine className="h-4 w-4" /> Reserve a Table
              </Link>
            </Button>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {packages.map((pkg, i) => (
            <Reveal key={pkg.id} delay={i * 0.08}>
              <div className="group h-full rounded-2xl border border-white/10 bg-surface/80 backdrop-blur p-6 md:p-8 card-lift">
                <p className="text-[10px] uppercase tracking-[0.3em] text-accent">{pkg.tier}</p>
                <h3 className="mt-2 font-display text-2xl md:text-3xl">{pkg.name}</h3>
                {pkg.tagline && <p className="mt-2 text-sm text-muted">{pkg.tagline}</p>}
                <div className="mt-5 pt-5 border-t border-white/10">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted">From</p>
                  <p className="mt-1 font-display text-2xl">{formatPriceMinor(pkg.priceMinor)}</p>
                </div>
                <ul className="mt-5 space-y-2 text-sm text-muted">
                  {pkg.perks.slice(0, 4).map((perk) => (
                    <li key={perk} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 rounded-full bg-accent" />
                      {perk}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/bookings?pkg=${pkg.tier}`}
                  className="mt-6 inline-flex items-center text-sm text-foreground group-hover:text-accent transition-colors"
                >
                  Reserve {pkg.name} →
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
