import Link from 'next/link';
import Image from 'next/image';
import type { Artist, LineupSlot } from '@prisma/client';

interface LineupListProps {
  lineup: Array<LineupSlot & { artist: Artist | null }>;
}

export function LineupList({ lineup }: LineupListProps) {
  if (lineup.length === 0) return null;
  return (
    <ul className="divide-y divide-white/5 rounded-2xl border border-white/5 bg-surface overflow-hidden">
      {lineup.map((slot) => (
        <li key={slot.id} className="flex items-center gap-4 p-4 md:p-5">
          <div className="relative h-14 w-14 md:h-16 md:w-16 shrink-0 overflow-hidden rounded-full border border-white/10 bg-elevated">
            {slot.artist?.avatar ? (
              <Image
                src={slot.artist.avatar}
                alt=""
                aria-hidden
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <div
                aria-hidden
                className="h-full w-full grid place-items-center text-muted text-xs uppercase"
              >
                {slot.displayName.charAt(0)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg truncate">
              {slot.artist ? (
                <Link href={`/artists/${slot.artist.slug}`} className="hover:text-accent">
                  {slot.displayName}
                </Link>
              ) : (
                slot.displayName
              )}
            </p>
            {slot.role && (
              <p className="text-xs uppercase tracking-[0.18em] text-muted mt-0.5">{slot.role}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
