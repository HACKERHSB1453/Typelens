import type { ReactNode } from 'react';
import { Spinner } from './Spinner';
import { Retry } from './Retry';
import { EmptyState } from './EmptyState';

/**
 * Enforces the "loading / error / empty / content" contract on every screen.
 * Pass the async resource state and the content; the right state renders.
 */
export function StateView({
  loading,
  error,
  empty,
  onRetry,
  emptyTitle,
  emptyHint,
  minHeight = 160,
  children,
}: {
  loading: boolean;
  error: Error | null;
  empty: boolean;
  onRetry: () => void;
  emptyTitle?: string;
  emptyHint?: ReactNode;
  minHeight?: number;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-[var(--sub-2)] p-8" style={{ minHeight }}>
        <Spinner size="md" />
      </div>
    );
  }
  if (error) {
    return <Retry error={error} onRetry={onRetry} />;
  }
  if (empty) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }
  return <>{children}</>;
}
