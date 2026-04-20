import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { site } from '@/lib/site';

// Actual logo asset dimensions (public/brand/d-global-logo.png).
// next/image uses these for layout-shift-free rendering; the element is then
// height-scaled to the requested size via the `height` prop.
const LOGO_INTRINSIC_WIDTH = 3072;
const LOGO_INTRINSIC_HEIGHT = 2600;
const LOGO_ASPECT = LOGO_INTRINSIC_WIDTH / LOGO_INTRINSIC_HEIGHT;

// The PNG ships with a fair amount of transparent padding around the
// glyph, which made the rendered mark feel tiny inside its layout box.
// scale-[1.4] lets the visible glyph fill closer to the bounding box
// without us re-cutting the asset; the wrapping span is overflow-visible
// so the scaled image extends slightly outside its layout footprint
// instead of getting clipped. Combined with a larger default size, the
// brand mark reads at the weight it deserves in the header.
const LOGO_TRIM_SCALE = 1.4;

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
        src="/brand/d-global-logo.png"
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
