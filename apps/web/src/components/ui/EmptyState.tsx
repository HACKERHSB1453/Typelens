import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

/** Empty state — shown when a query succeeds but has nothing to show. */
export function EmptyState({
  title = 'No data',
  hint,
  action,
}: {
  title?: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--sub-2)] p-8 text-center">
      <Inbox className="h-6 w-6 text-[var(--sub)]" aria-hidden />
      <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
      {hint && <p className="max-w-md text-xs text-[var(--sub)]">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
