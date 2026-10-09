import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { useFilters } from '@/hooks/useFilters';
import { useAnalysis } from '@/hooks/useData';
import type { NgramStat } from '@/data/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { StateView } from '@/components/ui/StateView';
import { SortableTable, type Column } from '@/components/ui/SortableTable';
import { cn, formatMs, formatNumber, formatPercent, clamp } from '@/lib/utils';

type Tab = 'bigrams' | 'trigrams';

/** Width of the inline impact bar is proportional to |impact| capped at this many ms. */
const COST_BAR_MAX_MS = 60;

/**
 * Cost weighted by evidence: a +80 ms pair seen 7 times is mostly noise, +40 ms over 125 times is a real
 * weakness. Same pseudo-count (20) the analysis uses to rank "weakest spots".
 */
const impact = (r: NgramStat): number => (r.costMs * r.count) / (r.count + 20);

export function Ngrams() {
  const { filters, includeSpaceNgrams } = useFilters();
  const { data, loading, error, retry } = useAnalysis(filters);
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('bigrams');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const allRows = useMemo<NgramStat[]>(() => {
    if (!data) return [];
    return tab === 'bigrams' ? data.bigrams : data.trigrams;
  }, [data, tab]);

  const rows = useMemo<NgramStat[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((r) => r.gram.toLowerCase().includes(q));
  }, [allRows, query]);

  const toggle = useCallback((gram: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(gram)) next.delete(gram);
      else next.add(gram);
      return next;
    });
  }, []);

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.gram));

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSel = rows.length > 0 && rows.every((r) => next.has(r.gram));
      if (allSel) {
        rows.forEach((r) => next.delete(r.gram));
      } else {
        rows.forEach((r) => next.add(r.gram));
      }
      return next;
    });
  }, [rows]);

  const practice = () => {
    const grams = Array.from(selected).join(',');
    navigate(`/practice?focus=grams&grams=${encodeURIComponent(grams)}`);
  };

  const columns = useMemo<Column<NgramStat>[]>(
    () => [
      {
        key: 'select',
        header: (
          <Checkbox
            aria-label="Select all visible grams"
            checked={allVisibleSelected}
            onChange={toggleAll}
          />
        ),
        cell: (r) => (
          <Checkbox
            aria-label={`Select gram ${r.gram}`}
            checked={selected.has(r.gram)}
            onChange={() => toggle(r.gram)}
          />
        ),
        align: 'center',
      },
      {
        key: 'gram',
        header: 'Gram',
        cell: (r) => <span className="font-bold text-[var(--text)]">{r.gram}</span>,
      },
      {
        key: 'count',
        header: 'Count',
        cell: (r) => formatNumber(r.count),
        sortValue: (r) => r.count,
        align: 'right',
      },
      {
        key: 'medianMs',
        header: 'Median',
        cell: (r) => formatMs(r.medianMs),
        sortValue: (r) => r.medianMs,
        align: 'right',
      },
      {
        key: 'expectedMs',
        header: 'Expected',
        cell: (r) => formatMs(r.expectedMs),
        sortValue: (r) => r.expectedMs,
        align: 'right',
      },
      {
        key: 'costMs',
        header: 'Cost',
        cell: (r) => (
          <span
            className={cn(
              r.costMs > 0
                ? 'text-[var(--error)]'
                : r.costMs < 0
                  ? 'text-[var(--ok)]'
                  : 'text-[var(--sub)]',
            )}
          >
            {formatMs(r.costMs)}
          </span>
        ),
        sortValue: (r) => r.costMs,
        align: 'right',
      },
      {
        key: 'impact',
        header: 'Impact',
        cell: (r) => <span className="text-[var(--text)]" title="cost weighted by how often you type it">{formatMs(Math.round(impact(r)))}</span>,
        sortValue: (r) => impact(r),
        align: 'right',
      },
      {
        key: 'errorRate',
        header: 'Errors',
        cell: (r) => formatPercent(r.errorRate * 100),
        sortValue: (r) => r.errorRate,
        align: 'right',
      },
      {
        key: 'costBar',
        header: <BarChart3 className="h-3.5 w-3.5" aria-label="Impact" />,
        cell: (r) => {
          const pct = clamp(Math.abs(impact(r)) / COST_BAR_MAX_MS, 0, 1) * 100;
          const color =
            impact(r) > 0
              ? 'bg-[var(--error)]'
              : impact(r) < 0
                ? 'bg-[var(--ok)]'
                : 'bg-[var(--sub-2)]';
          return (
            <div className="flex items-center justify-end">
              <div className="h-1.5 w-20 overflow-hidden rounded bg-[var(--bg-elev)]">
                <div className={cn('h-full rounded', color)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        },
        align: 'right',
      },
    ],
    [allVisibleSelected, toggleAll, selected, toggle],
  );

  const empty = !data || allRows.length === 0;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">N-grams</h1>

      <Card>
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'bigrams', label: 'Bigrams' },
            { value: 'trigrams', label: 'Trigrams' },
          ]}
        />

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <label htmlFor="ngrams-search" className="text-xs text-[var(--sub)]">
              Search grams
            </label>
            <Input
              id="ngrams-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. th, ing, qu"
              className="sm:w-64"
            />
          </div>

          <div className="flex items-center gap-3">
            <Badge tone={selected.size > 0 ? 'main' : 'sub'}>{selected.size} selected</Badge>
            <Button
              variant="primary"
              size="md"
              onClick={practice}
              disabled={selected.size === 0}
            >
              Practice selected
            </Button>
          </div>
        </div>

        <p className="mt-2 text-xs text-[var(--sub)]">
          Space-ngrams are {includeSpaceNgrams ? 'included' : 'excluded'} — toggle{' '}
          <span className="text-[var(--text)]">include space-ngrams</span> in the filter bar.
        </p>

        <div className="mt-3">
          <StateView
            loading={loading}
            error={error}
            empty={empty}
            onRetry={retry}
            emptyTitle="No n-grams"
            emptyHint="No bigram or trigram data for the current filters. Try widening the range or lowering the minimum samples."
            minHeight={320}
          >
            <SortableTable<NgramStat>
              columns={columns}
              rows={rows}
              rowKey={(r) => r.gram}
              maxRowsVisible={16}
              initialSort={{ key: 'impact', dir: 'desc' }}
              emptyHint="No grams match your search."
            />
          </StateView>
        </div>
      </Card>
    </div>
  );
}
