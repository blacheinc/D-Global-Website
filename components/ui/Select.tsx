import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'w-full appearance-none rounded-xl bg-elevated border border-white/10 px-4 py-3 pr-10 text-foreground',
          'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 transition-colors',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.08l3.71-3.85a.75.75 0 111.08 1.04l-4.25 4.41a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </div>
  ),
);
Select.displayName = 'Select';
