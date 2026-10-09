import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Checkbox({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={cn('inline-flex cursor-pointer select-none items-center gap-2 text-sm text-[var(--text)]', className)}>
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--main)] cursor-pointer"
        {...rest}
      />
      {label && <span>{label}</span>}
    </label>
  );
}
