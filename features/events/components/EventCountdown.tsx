'use client';

import { useEffect, useState } from 'react';
import { diffCountdown } from '@/lib/formatDate';

interface EventCountdownProps {
  target: string | Date;
  className?: string;
}

export function EventCountdown({ target, className }: EventCountdownProps) {
  const [parts, setParts] = useState(() => diffCountdown(target));

  useEffect(() => {
    const tick = () => setParts(diffCountdown(target));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  if (parts.total <= 0) {
    return (
      <div className={className}>
        <p className="text-xs uppercase tracking-[0.2em] text-accent">Doors are open</p>
      </div>
    );
  }

  const cells: Array<[number, string]> = [
    [parts.days, 'days'],
    [parts.hours, 'hrs'],
    [parts.minutes, 'min'],
    [parts.seconds, 'sec'],
  ];

  return (
    <div className={className}>
      <p className="text-xs uppercase tracking-[0.22em] text-muted mb-3">Countdown</p>
      <div className="grid grid-cols-4 gap-2 md:gap-3 max-w-md">
        {cells.map(([value, label]) => (
          <div
            key={label}
            className="rounded-xl border border-white/10 bg-elevated p-3 md:p-4 text-center"
          >
            <div className="font-display text-2xl md:text-4xl tabular-nums text-foreground">
              {String(value).padStart(2, '0')}
            </div>
            <div className="mt-1 text-[10px] md:text-xs uppercase tracking-[0.22em] text-muted">
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
