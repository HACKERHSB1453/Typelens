import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Segmented control — used for metric switches and binary toggles. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  className,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex rounded-md border border-[var(--sub-2)] bg-[var(--bg-dark)] p-0.5',
        size === 'sm' ? 'text-xs' : 'text-sm',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded px-2.5 py-1 transition',
              size === 'sm' ? 'text-xs' : 'text-xs',
              active
                ? 'bg-[var(--main)] text-[var(--bg)] font-semibold'
                : 'text-[var(--sub)] hover:text-[var(--text)]',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
