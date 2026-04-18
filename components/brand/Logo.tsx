import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// Actual logo asset dimensions (public/brand/d-global-logo.png).
// next/image uses these for layout-shift-free rendering; the element is then
// height-scaled to the requested size via the `height` prop.
const LOGO_INTRINSIC_WIDTH = 3072;
const LOGO_INTRINSIC_HEIGHT = 2600;
const LOGO_ASPECT = LOGO_INTRINSIC_WIDTH / LOGO_INTRINSIC_HEIGHT;

interface LogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  href?: string | null;
}

export function Logo({ size = 40, className, showWordmark = true, href = '/' }: LogoProps) {
  const width = Math.round(size * LOGO_ASPECT);
  const content = (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <Image
        src="/brand/d-global-logo.png"
        alt={showWordmark ? '' : 'D-Global'}
        aria-hidden={showWordmark ? true : undefined}
        width={width}
        height={size}
        priority
      />
      {showWordmark && (
        <span className="font-display text-lg tracking-[0.18em] uppercase">D-Global</span>
      )}
    </span>
  );
  if (!href) return content;
  return (
    <Link
      href={href}
      aria-label="D-Global, home"
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
    >
      {content}
    </Link>
  );
}
