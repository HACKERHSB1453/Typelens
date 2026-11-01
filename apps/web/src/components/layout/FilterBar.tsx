import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { useFilters, type RangePreset } from '@/hooks/useFilters';
import { Segmented } from '@/components/ui/Segmented';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { openCommandPalette } from './CommandPalette';

const RANGE_OPTIONS: Array<{ value: RangePreset; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** A toggle pill: the filter bar's way of picking modes and languages. */
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-7 rounded-full border px-2.5 text-xs transition-colors',
        active
          ? 'border-[var(--main)] bg-main/10 text-[var(--main)]'
          : 'border-[var(--sub-2)] text-[var(--sub)] hover:border-[var(--sub)] hover:text-[var(--text)]',
      )}
    >
      {children}
    </button>
  );
}

export function FilterBar({ className }: { className?: string }) {
  const f = useFilters();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // advanced options that differ from the defaults (shown as a count on the Options button)
  const advanced = [f.minSamples !== 5, f.includeSpaceNgrams, f.practiceOnly, !f.excludeFlagged].filter(Boolean).length;
  const dirty = f.rangePreset !== '90d' || f.modes.length > 0 || f.languages.length > 0 || advanced > 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      className={cn(
        'sticky top-0 z-20 border-b border-[var(--sub-2)] bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/80',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 md:px-6">
        <Segmented size="sm" ariaLabel="Date range" value={f.rangePreset} onChange={(v) => f.setRangePreset(v)} options={RANGE_OPTIONS} />

        <span className="hidden h-5 w-px bg-[var(--sub-2)] sm:block" aria-hidden />

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Modes">
          {f.availableModes.map((m) => (
            <Pill key={m} active={f.modes.includes(m)} onClick={() => f.toggleMode(m)}>
              {m}
            </Pill>
          ))}
        </div>

        {f.availableLanguages.length > 1 && (
          <>
            <span className="hidden h-5 w-px bg-[var(--sub-2)] sm:block" aria-hidden />
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Languages">
              {f.availableLanguages.map((l) => (
                <Pill key={l} active={f.languages.includes(l)} onClick={() => f.toggleLanguage(l)}>
                  {l.replace(/_/g, ' ')}
                </Pill>
              ))}
            </div>
          </>
        )}

        <div className="relative" ref={panel}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors',
              open || advanced > 0
                ? 'border-[var(--sub)] text-[var(--text)]'
                : 'border-[var(--sub-2)] text-[var(--sub)] hover:border-[var(--sub)] hover:text-[var(--text)]',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            Options
            {advanced > 0 && (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[var(--main)] px-1 text-[10px] font-bold text-[var(--bg)]">
                {advanced}
              </span>
            )}
            <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
          {open && (
            <div
              role="dialog"
              aria-label="Analysis options"
              className="absolute left-0 top-9 z-30 w-72 space-y-3 rounded-lg border border-[var(--sub-2)] bg-[var(--bg-dark)] p-4 shadow-2xl shadow-black/50"
            >
              <label className="flex items-center justify-between gap-3 text-xs text-[var(--text)]">
                <span className="flex-1">
                  Minimum samples
                  <span className="block text-[11px] text-[var(--sub)]">Hide keys and n-grams seen fewer times</span>
                </span>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={f.minSamples}
                  onChange={(e) => f.setMinSamples(Math.max(1, Number(e.target.value) || 5))}
                  className="h-7 !w-16 shrink-0 px-2 text-xs"
                />
              </label>
              <div className="h-px bg-[var(--sub-2)]" />
              <Checkbox label="Include space in n-grams" checked={f.includeSpaceNgrams} onChange={(e) => f.setIncludeSpaceNgrams(e.target.checked)} />
              <Checkbox label="Practice tests only" checked={f.practiceOnly} onChange={(e) => f.setPracticeOnly(e.target.checked)} />
              <Checkbox label="Exclude flagged tests" checked={f.excludeFlagged} onChange={(e) => f.setExcludeFlagged(e.target.checked)} />
            </div>
          )}
        </div>

        {dirty && (
          <button
            onClick={f.reset}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-[var(--sub)] transition hover:bg-[var(--bg-elev)] hover:text-[var(--text)]"
          >
            <X className="h-3 w-3" aria-hidden /> Reset
          </button>
        )}

        <button
          type="button"
          onClick={openCommandPalette}
          className="ml-auto inline-flex h-7 items-center gap-2 rounded-md border border-[var(--sub-2)] px-2.5 text-xs text-[var(--sub)] transition-colors hover:border-[var(--sub)] hover:text-[var(--text)]"
          aria-label="Open the command palette"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden rounded border border-[var(--sub-2)] px-1 text-[10px] sm:inline">{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
      </div>
    </div>
  );
}
