import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  href?: string | null;
}

export function Logo({ size = 40, className, showWordmark = true, href = '/' }: LogoProps) {
  const content = (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <Image
        src="/brand/d-global-logo.png"
        alt="D-Global"
        width={size}
        height={size}
        priority
        className="h-auto w-auto"
        style={{ maxHeight: size }}
      />
      {showWordmark && (
        <span className="font-display text-lg tracking-[0.18em] uppercase">D-Global</span>
      )}
    </span>
  );
  if (!href) return content;
  return (
    <Link href={href} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md">
      {content}
    </Link>
  );
}
