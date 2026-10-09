import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--main)] text-[var(--bg)] hover:brightness-110 disabled:opacity-40',
  ghost: 'text-[var(--sub)] hover:text-[var(--text)] hover:bg-[var(--bg-elev)]',
  outline:
    'border border-[var(--sub)] text-[var(--text)] hover:bg-[var(--bg-elev)]',
  danger: 'border border-[var(--error)] text-[var(--error)] hover:bg-error/10',
  subtle: 'bg-[var(--bg-elev)] text-[var(--text)] hover:brightness-110',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-9 px-3 text-sm',
  lg: 'h-10 px-4 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'subtle', size = 'md', className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
