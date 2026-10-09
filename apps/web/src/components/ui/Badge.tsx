import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'main' | 'sub' | 'error' | 'ok' | 'neutral';

const TONES: Record<Tone, string> = {
  main: 'text-[var(--main)] border-main/40 bg-main/10',
  sub: 'text-[var(--sub)] border-[var(--sub-2)] bg-[var(--bg-elev)]',
  error: 'text-[var(--error)] border-error/40 bg-error/10',
  ok: 'text-[var(--ok)] border-ok/40 bg-ok/10',
  neutral: 'text-[var(--text)] border-[var(--sub-2)] bg-transparent',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
