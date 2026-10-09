import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Lightweight accessible tabs (no dependency on a UI lib). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('flex gap-1 border-b border-[var(--sub-2)]', className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'px-3 py-2 text-sm transition border-b-2 -mb-px',
              active
                ? 'border-[var(--main)] text-[var(--text)]'
                : 'border-transparent text-[var(--sub)] hover:text-[var(--text)]',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
