import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from './Button';

/** Error state with a Retry button — shown when a data fetch fails. */
export function Retry({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-error/40 bg-error/5 p-8 text-center">
      <AlertTriangle className="h-6 w-6 text-[var(--error)]" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-[var(--text)]">Something went wrong</p>
        <p className="mt-1 max-w-md text-xs text-[var(--sub)]">
          {error?.message ?? 'Failed to load data.'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw className="h-3.5 w-3.5" /> Retry
      </Button>
    </div>
  );
}
