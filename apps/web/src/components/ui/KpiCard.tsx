import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KpiDelta {
  /** change versus the previous period; null when there is nothing to compare with */
  value: number | null;
  /** how to print the change, e.g. (v) => `${v.toFixed(1)} wpm` */
  format: (v: number) => string;
  /** false when a smaller number is better (e.g. hold time) */
  upIsGood?: boolean;
  /** changes smaller than this count as "no change" */
  epsilon?: number;
  /** e.g. "vs previous 30 days" */
  label?: string;
}

/** KPI card: label, big number, an optional change versus the previous period, and a hint. */
export function KpiCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
  delta,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'main' | 'error' | 'ok';
  icon?: ReactNode;
  delta?: KpiDelta;
  className?: string;
}) {
  const toneText = tone === 'main' ? 'text-[var(--main)]' : tone === 'error' ? 'text-[var(--error)]' : 'text-[var(--text)]';
  return (
    <div
      className={cn(
        'group rounded-lg border border-[var(--sub-2)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--sub)]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-medium uppercase tracking-wider text-[var(--sub)]">{label}</span>
        {icon && <span className="text-[var(--sub)]">{icon}</span>}
      </div>
      <div className={cn('mt-2 text-2xl font-bold tnum leading-none', toneText)}>{value}</div>
      {delta && <DeltaLine delta={delta} />}
      {hint && <div className="mt-1.5 truncate text-[11px] text-[var(--sub)]">{hint}</div>}
    </div>
  );
}

function DeltaLine({ delta }: { delta: KpiDelta }) {
  const { value, format, upIsGood = true, epsilon = 0, label } = delta;
  if (value === null || !Number.isFinite(value)) {
    return <div className="mt-2 text-[11px] text-[var(--sub)]">no earlier data to compare</div>;
  }
  const flat = Math.abs(value) <= epsilon;
  const good = flat ? null : value > 0 === upIsGood;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="mt-2 flex items-center gap-1 text-[11px]" title={label}>
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-semibold tnum',
          good === null ? 'bg-[var(--bg-elev)] text-[var(--sub)]' : good ? 'bg-main/10 text-[var(--main)]' : 'bg-error/10 text-[var(--error)]',
        )}
      >
        <Icon className="h-3 w-3" aria-hidden />
        {flat ? 'no change' : `${value > 0 ? '+' : '−'}${format(Math.abs(value))}`}
      </span>
      {label && <span className="truncate text-[var(--sub)]">{label}</span>}
    </div>
  );
}
