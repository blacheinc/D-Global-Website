import Image from 'next/image';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPriceMinor } from '@/lib/formatCurrency';
import type { Package } from '@prisma/client';

interface PackageCardProps {
  pkg: Package;
  selected?: boolean;
  onClick?: () => void;
}

export function PackageCard({ pkg, selected, onClick }: PackageCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full text-left rounded-2xl overflow-hidden border bg-surface card-lift',
        selected
          ? 'border-accent shadow-glow-sm'
          : 'border-white/10 hover:border-white/20',
      )}
      aria-pressed={selected}
    >
      <div className="relative aspect-[4/3]">
        {pkg.heroImage && (
          <Image
            src={pkg.heroImage}
            alt=""
            aria-hidden
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        <div className="absolute top-4 left-4">
          <span className="inline-flex items-center rounded-full bg-black/60 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-accent">
            {pkg.tier}
          </span>
        </div>
        {selected && (
          <div
            aria-hidden
            className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full bg-accent text-white"
          >
            <Check className="h-4 w-4" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="font-display text-2xl">{pkg.name}</p>
          {pkg.tagline && <p className="text-sm text-muted mt-1">{pkg.tagline}</p>}
        </div>
      </div>

      <div className="p-5 md:p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">From</p>
            <p className="font-display text-2xl mt-0.5">{formatPriceMinor(pkg.priceMinor)}</p>
          </div>
          <div className="text-right text-xs text-muted">
            Up to {pkg.maxGuests} guests
            {pkg.bottlesIncl > 0 && <div>{pkg.bottlesIncl} bottles incl.</div>}
          </div>
        </div>
        {pkg.perks.length > 0 && (
          <ul className="space-y-2 text-sm text-muted">
            {pkg.perks.map((perk) => (
              <li key={perk} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 rounded-full bg-accent" />
                {perk}
              </li>
            ))}
          </ul>
        )}
      </div>
    </button>
  );
}
