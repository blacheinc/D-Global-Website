import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const baseField =
  'w-full rounded-xl bg-elevated border border-white/10 px-4 py-3 text-foreground placeholder:text-muted/60 ' +
  'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 transition-colors';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(baseField, className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(baseField, 'min-h-[120px] resize-y', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('block text-xs font-medium uppercase tracking-[0.18em] text-muted mb-2', className)}
      {...props}
    />
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1.5 text-xs text-accent-hot">{children}</p>;
}
