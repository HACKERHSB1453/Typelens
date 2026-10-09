import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-md border border-[var(--sub-2)] bg-[var(--bg-dark)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--sub)] focus:border-[var(--main)]',
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 rounded-md border border-[var(--sub-2)] bg-[var(--bg-dark)] px-2 text-sm text-[var(--text)] focus:border-[var(--main)]',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}
