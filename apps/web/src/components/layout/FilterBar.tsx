import { SlidersHorizontal, X } from 'lucide-react';
import { useFilters, type RangePreset } from '@/hooks/useFilters';
import { Segmented } from '@/components/ui/Segmented';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

const RANGE_OPTIONS: Array<{ value: RangePreset; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'all' },
];

export function FilterBar({ className }: { className?: string }) {
  const f = useFilters();
  const dirty =
    f.rangePreset !== '90d' ||
    f.modes.length > 0 ||
    f.languages.length > 0 ||
    f.minSamples !== 5 ||
    f.includeSpaceNgrams ||
    f.practiceOnly ||
    !f.excludeFlagged;

  return (
    <div
      className={cn(
        'sticky top-0 z-20 border-b border-[var(--sub-2)] bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/80',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 md:px-6">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[var(--sub)]" aria-hidden />
          <Segmented
            size="sm"
            ariaLabel="Date range"
            value={f.rangePreset}
            onChange={(v) => f.setRangePreset(v)}
            options={RANGE_OPTIONS}
          />
        </div>

        <FilterGroup label="mode">
          {f.availableModes.map((m) => (
            <Checkbox
              key={m}
              label={m}
              checked={f.modes.includes(m)}
              onChange={() => f.toggleMode(m)}
            />
          ))}
        </FilterGroup>

        <FilterGroup label="language">
          {f.availableLanguages.map((l) => (
            <Checkbox
              key={l}
              label={l}
              checked={f.languages.includes(l)}
              onChange={() => f.toggleLanguage(l)}
            />
          ))}
        </FilterGroup>

        <label className="flex items-center gap-2 text-xs text-[var(--sub)]">
          min samples
          <Input
            type="number"
            min={1}
            max={50}
            value={f.minSamples}
            onChange={(e) => f.setMinSamples(Math.max(1, Number(e.target.value) || 5))}
            className="h-7 w-16 px-2 text-xs"
          />
        </label>

        <Checkbox
          label="include space n-grams"
          checked={f.includeSpaceNgrams}
          onChange={(e) => f.setIncludeSpaceNgrams(e.target.checked)}
        />
        <Checkbox
          label="practice only"
          checked={f.practiceOnly}
          onChange={(e) => f.setPracticeOnly(e.target.checked)}
        />
        <Checkbox
          label="exclude flagged"
          checked={f.excludeFlagged}
          onChange={(e) => f.setExcludeFlagged(e.target.checked)}
        />

        {dirty && (
          <button
            onClick={f.reset}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--sub)] transition hover:bg-[var(--bg-elev)] hover:text-[var(--text)]"
          >
            <X className="h-3 w-3" /> Reset
          </button>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-[var(--sub)]">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
