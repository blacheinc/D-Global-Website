import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/5 bg-surface card-lift',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5 md:p-6', className)} {...props} />
  ),
);
CardBody.displayName = 'CardBody';

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('font-display text-xl md:text-2xl text-foreground', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardMuted = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted', className)} {...props} />
  ),
);
CardMuted.displayName = 'CardMuted';
