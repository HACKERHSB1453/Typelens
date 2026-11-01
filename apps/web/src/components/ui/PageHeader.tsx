import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Title, one line of explanation and optional actions at the top of every page. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-3 border-b border-[var(--sub-2)] pb-4', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--sub)]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
