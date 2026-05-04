import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { site } from '@/lib/site';

// Actual logo asset dimensions (public/brand/dglobal-logo.png).
// next/image uses these for layout-shift-free rendering; the element is then
// height-scaled to the requested size via the `height` prop.
const LOGO_INTRINSIC_WIDTH = 370;
const LOGO_INTRINSIC_HEIGHT = 512;
const LOGO_ASPECT = LOGO_INTRINSIC_WIDTH / LOGO_INTRINSIC_HEIGHT;

// The trim-scale used to be 1.4 because the old landscape PNG had a
// lot of transparent padding around its glyph. The new dglobal-logo.png
// is cropped tight, so no CSS trim is needed, render at 1:1. Kept as a
// constant so if a future asset drop needs trimming again, only this
// number has to change.
const LOGO_TRIM_SCALE = 1;

interface LogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  href?: string | null;
}

export function Logo({ size = 56, className, showWordmark = true, href = '/' }: LogoProps) {
  const width = Math.round(size * LOGO_ASPECT);
  const content = (
    <span className={cn('inline-flex items-center gap-3 overflow-visible', className)}>
      <Image
        src="/brand/dglobal-logo.png"
        alt={showWordmark ? '' : site.name}
        aria-hidden={showWordmark ? true : undefined}
        width={width}
        height={size}
        priority
        style={{ transform: `scale(${LOGO_TRIM_SCALE})`, transformOrigin: 'center' }}
      />
      {showWordmark && (
        // Hidden on mobile (the icon alone carries the brand in the
        // tight top bar); shown from sm: up where there's room for the
        // full wordmark. tracking is gentler than the old text-lg /
        // 0.18em so "D Global Entertainment" doesn't span half the bar.
        <span className="hidden sm:inline-block font-display text-sm tracking-[0.14em] uppercase whitespace-nowrap">
          {site.name}
        </span>
      )}
    </span>
  );
  if (!href) return content;
  return (
    <Link
      href={href}
      aria-label={`${site.name}, home`}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
    >
      {content}
    </Link>
  );
}
