import { PageHeader } from '@/components/ui/PageHeader';
import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useFilters } from '@/hooks/useFilters';
import { useAnalysis } from '@/hooks/useData';
import type { WordStat } from '@/data/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { StateView } from '@/components/ui/StateView';
import { SortableTable, type Column } from '@/components/ui/SortableTable';
import { cn, formatNumber, formatPercent, clamp } from '@/lib/utils';

type View = 'slowest' | 'mistyped';

/** Bar scales: clamp the metric into [0, 1] before mapping to width. */
const WPM_BAR_MAX = 150;
const ERR_BAR_MAX = 0.25;

export function Words() {
  const { filters } = useFilters();
  const { data, loading, error, retry } = useAnalysis(filters);

  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('slowest');

  const allRows = useMemo<WordStat[]>(() => data?.words ?? [], [data]);

  const rows = useMemo<WordStat[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((r) => r.word.toLowerCase().includes(q));
  }, [allRows, query]);

  const initialSort =
    view === 'slowest'
      ? { key: 'medianWpm', dir: 'asc' as const }
      : { key: 'errorRate', dir: 'desc' as const };

  const columns = useMemo<Column<WordStat>[]>(
    () => [
      {
        key: 'word',
        header: 'Word',
        cell: (r) => <span className="font-bold text-[var(--text)]">{r.word}</span>,
      },
      {
        key: 'count',
        header: 'Count',
        cell: (r) => formatNumber(r.count),
        sortValue: (r) => r.count,
        align: 'right',
      },
      {
        key: 'medianWpm',
        header: 'Median WPM',
        cell: (r) => formatNumber(r.medianWpm, 1),
        sortValue: (r) => r.medianWpm,
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
        key: 'correctedRate',
        header: 'Corrected',
        cell: (r) => formatPercent(r.correctedRate * 100),
        sortValue: (r) => r.correctedRate,
        align: 'right',
      },
      {
        key: 'bar',
        header: (
          <BarChart3
            className="h-3.5 w-3.5"
            aria-label={view === 'slowest' ? 'Speed magnitude' : 'Error magnitude'}
          />
        ),
        cell: (r) => {
          const pct =
            view === 'slowest'
              ? clamp(r.medianWpm / WPM_BAR_MAX, 0, 1) * 100
              : clamp(r.errorRate / ERR_BAR_MAX, 0, 1) * 100;
          const color = view === 'slowest' ? 'bg-[var(--main)]' : 'bg-[var(--error)]';
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
    [view],
  );

  const empty = !data || data.words.length === 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Words" description="The words that slow you down or trip you up most often." />

      <Card>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <label htmlFor="words-search" className="text-xs text-[var(--sub)]">
              Search words
            </label>
            <Input
              id="words-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. the, and"
              className="sm:w-64"
            />
          </div>

          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: 'slowest', label: 'Slowest' },
              { value: 'mistyped', label: 'Most mistyped' },
            ]}
            ariaLabel="Word view"
          />
        </div>

        <StateView
          loading={loading}
          error={error}
          empty={empty}
          onRetry={retry}
          emptyTitle="No words"
          emptyHint="No word-level stats for the current filters. Try widening the range or lowering the minimum samples."
          minHeight={320}
        >
          <SortableTable<WordStat>
            key={view}
            columns={columns}
            rows={rows}
            rowKey={(r) => r.word}
            maxRowsVisible={16}
            initialSort={initialSort}
            emptyHint="No words match your search."
          />
        </StateView>
      </Card>
    </div>
  );
}
