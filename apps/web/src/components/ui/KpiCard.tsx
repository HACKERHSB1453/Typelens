import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** KPI card — a big number + label + optional trend / hint. */
export function KpiCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'main' | 'error' | 'ok';
  icon?: ReactNode;
  className?: string;
}) {
  const toneText =
    tone === 'main'
      ? 'text-[var(--main)]'
      : tone === 'error'
        ? 'text-[var(--error)]'
        : tone === 'ok'
          ? 'text-[var(--text)]' // the theme has no success colour; grey would read as disabled
          : 'text-[var(--text)]';
  return (
    <div className={cn('rounded-lg border border-[var(--sub-2)] bg-[var(--bg-card)] p-4', className)}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-[var(--sub)]">{label}</span>
        {icon && <span className="text-[var(--sub)]">{icon}</span>}
      </div>
      <div className={cn('mt-2 text-2xl font-bold tnum', toneText)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--sub)]">{hint}</div>}
    </div>
  );
}
