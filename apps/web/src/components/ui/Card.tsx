import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Surface card — the primary container on every page. */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--sub-2)] bg-[var(--bg-card)] p-4 shadow-card',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-start justify-between gap-3', className)}>
      <div>
        <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-[var(--sub)]">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
