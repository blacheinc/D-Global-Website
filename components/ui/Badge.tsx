import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.15em]',
  {
    variants: {
      tone: {
        accent: 'bg-accent/15 text-accent border border-accent/30',
        neutral: 'bg-white/10 text-foreground border border-white/15',
        muted: 'bg-white/5 text-muted border border-white/10',
        live: 'bg-accent text-white animate-pulse-red',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
