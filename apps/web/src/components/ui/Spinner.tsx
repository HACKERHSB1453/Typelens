import { cn } from '@/lib/utils';

/** Inline loading spinner. */
export function Spinner({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sz = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-5 w-5';
  return (
    <span role="status" aria-label="Loading" className={cn('inline-flex items-center justify-center', className)}>
      <svg className={cn('animate-spin', sz)} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="var(--sub-2)" strokeWidth="3" />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="var(--main)" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}
