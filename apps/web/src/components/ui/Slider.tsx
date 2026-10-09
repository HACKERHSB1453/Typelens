import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Styled native range input (track styled via index.css). */
export function Slider({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="range" className={cn('w-full', className)} {...rest} />;
}
