'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';

interface EventFiltersProps {
  cities: string[];
  genres: string[];
}

const WHEN_OPTIONS = [
  { value: 'all', label: 'All upcoming' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
] as const;

export function EventFilters({ cities, genres }: EventFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const currentWhen = searchParams.get('when') ?? 'all';
  const currentCity = searchParams.get('city') ?? '';
  const currentGenre = searchParams.get('genre') ?? '';

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.push(`/events?${params.toString()}`));
  };

  return (
    <div className={cn('space-y-5', pending && 'opacity-60')}>
      <div className="flex flex-wrap gap-2">
        {WHEN_OPTIONS.map((opt) => {
          const active = currentWhen === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => update('when', opt.value === 'all' ? '' : opt.value)}
              className={cn(
                'rounded-full px-4 py-2 text-sm border transition-colors',
                active
                  ? 'border-accent bg-accent/15 text-foreground'
                  : 'border-white/10 bg-white/5 text-muted hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {genres.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => update('genre', '')}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.18em] border transition-colors',
              !currentGenre
                ? 'border-accent bg-accent/15 text-foreground'
                : 'border-white/10 bg-white/5 text-muted hover:text-foreground',
            )}
          >
            All genres
          </button>
          {genres.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => update('genre', g === currentGenre ? '' : g)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.18em] border transition-colors',
                currentGenre === g
                  ? 'border-accent bg-accent/15 text-foreground'
                  : 'border-white/10 bg-white/5 text-muted hover:text-foreground',
              )}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {cities.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {cities.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => update('city', c === currentCity ? '' : c)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs border transition-colors',
                currentCity === c
                  ? 'border-accent bg-accent/15 text-foreground'
                  : 'border-white/10 bg-white/5 text-muted hover:text-foreground',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
