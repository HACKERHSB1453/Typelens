import { useMemo, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Segmented';
import { StateView } from '@/components/ui/StateView';
import { SortableTable } from '@/components/ui/SortableTable';
import type { Column } from '@/components/ui/SortableTable';
import { BarChart } from '@/components/charts/BarChart';
import type { BarSeries } from '@/components/charts/BarChart';
import { HandDiagram } from '@/components/charts/HandDiagram';
import type { HandMetric } from '@/components/charts/HandDiagram';
import { useFilters } from '@/hooks/useFilters';
import { useAnalysis } from '@/hooks/useData';
import { FINGER_INFO } from '@/data/keymap';
import type { FingerStat, HandStat, RowStat, Hand, Row } from '@/data/types';
import { formatMs, formatPercent, formatNumber, formatCompact, cn } from '@/lib/utils';

/* ============================================================================
 * Fingers & Hands page.
 *  - SVG hand diagram colored by metric (speed / error / hold / rollover)
 *  - Sortable finger table
 *  - Left vs Right hand bars
 *  - Row comparison bars
 *  - Same-finger-bigram + hand-alternation cost cards
 *  - Inter-key interval histogram
 * ------------------------------------------------------------------------- */

type HandBarMetric = 'count' | 'errorRate' | 'medianIkiMs' | 'medianHoldMs';
type RowMetric = 'count' | 'medianIkiMs';

const HAND_METRIC_OPTIONS: Array<{ value: HandMetric; label: string; title: string }> = [
  { value: 'speed', label: 'Speed', title: 'Median inter-key interval — lower iki is brighter (faster)' },
  { value: 'error', label: 'Errors', title: 'Error rate — higher error is more red' },
  { value: 'hold', label: 'Hold', title: 'Median key hold duration — higher is brighter' },
  { value: 'rollover', label: 'Rollover', title: 'Rollover rate — higher is brighter' },
];

const HAND_BAR_OPTIONS: Array<{ value: HandBarMetric; label: string; title: string }> = [
  { value: 'count', label: 'Count', title: 'Total keystrokes per hand' },
  { value: 'errorRate', label: 'Errors', title: 'Error rate per hand' },
  { value: 'medianIkiMs', label: 'IKI', title: 'Median inter-key interval per hand' },
  { value: 'medianHoldMs', label: 'Hold', title: 'Median hold duration per hand' },
];

const ROW_OPTIONS: Array<{ value: RowMetric; label: string; title: string }> = [
  { value: 'count', label: 'Count', title: 'Total keystrokes per row' },
  { value: 'medianIkiMs', label: 'Speed', title: 'Median inter-key interval per row' },
];

const ROW_ORDER: Row[] = ['number', 'top', 'home', 'bottom', 'space'];
const ROW_LABELS: Record<Row, string> = {
  number: 'Number',
  top: 'Top',
  home: 'Home',
  bottom: 'Bottom',
  space: 'Space',
};

interface BarSpec {
  labels: string[];
  series: BarSeries[];
  formatValue?: (v: number) => string;
}

export function Fingers() {
  const { filters } = useFilters();
  const { data: analysis, loading, error, retry } = useAnalysis(filters);
  const [handMetric, setHandMetric] = useState<HandMetric>('speed');
  const [handBarMetric, setHandBarMetric] = useState<HandBarMetric>('count');
  const [rowMetric, setRowMetric] = useState<RowMetric>('count');

  // ----- L vs R hand bars -----
  const handBars = useMemo<BarSpec>(() => {
    if (!analysis) return { labels: ['Left', 'Right'], series: [] };
    const lookup = (h: Hand) => analysis.hands.find((x) => x.hand === h);
    const l = lookup('L');
    const r = lookup('R');
    const val = (s: HandStat | undefined): number => {
      if (!s) return 0;
      switch (handBarMetric) {
        case 'count':
          return s.count;
        case 'errorRate':
          return s.errorRate * 100;
        case 'medianIkiMs':
          return s.medianIkiMs;
        case 'medianHoldMs':
          return s.medianHoldMs;
      }
    };
    const fmt = (v: number): string => {
      if (handBarMetric === 'count') return formatCompact(v);
      if (handBarMetric === 'errorRate') return formatPercent(v);
      return formatMs(v);
    };
    const label = HAND_BAR_OPTIONS.find((o) => o.value === handBarMetric)?.label ?? '';
    return {
      labels: ['Left', 'Right'],
      series: [{ label, data: [val(l), val(r)] }],
      formatValue: fmt,
    };
  }, [analysis, handBarMetric]);

  // ----- Row comparison -----
  const rowBars = useMemo<BarSpec>(() => {
    if (!analysis) return { labels: ROW_ORDER.map((rw) => ROW_LABELS[rw]), series: [] };
    const lookup = (rw: Row) => analysis.rows.find((x) => x.row === rw);
    const val = (s: RowStat | undefined): number => {
      if (!s) return 0;
      return rowMetric === 'count' ? s.count : s.medianIkiMs;
    };
    const fmt = (v: number): string => (rowMetric === 'count' ? formatCompact(v) : formatMs(v));
    return {
      labels: ROW_ORDER.map((rw) => ROW_LABELS[rw]),
      series: [{ label: rowMetric === 'count' ? 'Count' : 'Median IKI', data: ROW_ORDER.map((rw) => val(lookup(rw))) }],
      formatValue: fmt,
    };
  }, [analysis, rowMetric]);

  // ----- IKI histogram -----
  const ikiHist = useMemo<BarSpec>(() => {
    if (!analysis) return { labels: [], series: [] };
    const { binMs, counts: all } = analysis.ikiHistogram;
    // drop the empty tail so the populated range fills the chart (the last kept bin still reads "lo+" only if it is the overflow bin)
    let end = all.length;
    while (end > 1 && (all[end - 1] ?? 0) === 0) end--;
    const counts = all.slice(0, Math.min(all.length, end + 1));
    const labels = counts.map((_, i) => {
      const lo = i * binMs;
      const hi = lo + binMs;
      // Last bin is overflow ("600+").
      return i === counts.length - 1 ? `${lo}+` : `${lo}-${hi}`;
    });
    return {
      labels,
      series: [{ label: 'Count', data: counts }],
      formatValue: (v: number) => formatCompact(v),
    };
  }, [analysis]);

  // ----- Finger table columns -----
  const fingerColumns: Column<FingerStat>[] = useMemo(
    () => [
      {
        key: 'finger',
        header: 'Finger',
        cell: (r) => (
          <span className="inline-flex items-center gap-2">
            <span>{FINGER_INFO[r.finger].name}</span>
            <Badge tone="sub">{r.finger}</Badge>
          </span>
        ),
        sortValue: (r) => r.finger,
      },
      {
        key: 'hand',
        header: 'Hand',
        cell: (r) => <Badge tone={r.hand === 'L' ? 'main' : 'ok'}>{r.hand === 'L' ? 'Left' : 'Right'}</Badge>,
        sortValue: (r) => r.hand,
      },
      {
        key: 'count',
        header: 'Count',
        align: 'right',
        cell: (r) => formatNumber(r.count),
        sortValue: (r) => r.count,
      },
      {
        key: 'errorRate',
        header: 'Error rate',
        align: 'right',
        cell: (r) => (
          <span className={r.errorRate > 0.05 ? 'text-error' : ''}>{formatPercent(r.errorRate * 100)}</span>
        ),
        sortValue: (r) => r.errorRate,
      },
      {
        key: 'medianIkiMs',
        header: 'Median IKI',
        align: 'right',
        cell: (r) => formatMs(r.medianIkiMs),
        sortValue: (r) => r.medianIkiMs,
      },
      {
        key: 'medianHoldMs',
        header: 'Median hold',
        align: 'right',
        cell: (r) => formatMs(r.medianHoldMs),
        sortValue: (r) => r.medianHoldMs,
      },
      {
        key: 'rolloverRate',
        header: 'Rollover rate',
        align: 'right',
        cell: (r) => (
          <span className={r.rolloverRate > 0.3 ? 'text-main' : ''}>{formatPercent(r.rolloverRate * 100)}</span>
        ),
        sortValue: (r) => r.rolloverRate,
      },
    ],
    [],
  );

  const stateProps = { loading, error, onRetry: retry, empty: !analysis };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Fingers &amp; Hands</h1>

      {/* 1) SVG hand diagram */}
      <Card>
        <CardHeader
          title="Hand heatmap"
          subtitle="Each finger pill is colored by the selected metric. Hover for details."
          right={
            <Segmented
              value={handMetric}
              onChange={setHandMetric}
              options={HAND_METRIC_OPTIONS}
              ariaLabel="Hand diagram metric"
            />
          }
        />
        <StateView {...stateProps} emptyTitle="No finger data" minHeight={220}>
          <HandDiagram fingers={analysis?.fingers ?? []} metric={handMetric} />
        </StateView>
      </Card>

      {/* 2) Finger table */}
      <Card>
        <CardHeader title="Finger breakdown" subtitle="Per-finger metrics, sortable on every column." />
        <StateView {...stateProps} emptyTitle="No finger data" minHeight={220}>
          <SortableTable<FingerStat>
            columns={fingerColumns}
            rows={analysis?.fingers ?? []}
            rowKey={(r) => r.finger}
            maxRowsVisible={10}
            initialSort={{ key: 'count', dir: 'desc' }}
            emptyHint="No finger data in this filter range."
          />
        </StateView>
      </Card>

      {/* 3 & 4) Hand bars + row comparison */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Left vs Right"
            subtitle="Hand-level comparison across metrics."
            right={
              <Segmented
                value={handBarMetric}
                onChange={setHandBarMetric}
                options={HAND_BAR_OPTIONS}
                size="sm"
                ariaLabel="Hand bar metric"
              />
            }
          />
          <StateView {...stateProps} emptyTitle="No hand data" minHeight={220}>
            <BarChart
              labels={handBars.labels}
              series={handBars.series}
              formatValue={handBars.formatValue}
              horizontal
              height={180}
            />
          </StateView>
        </Card>

        <Card>
          <CardHeader
            title="Row comparison"
            subtitle="Count or speed per keyboard row."
            right={
              <Segmented
                value={rowMetric}
                onChange={setRowMetric}
                options={ROW_OPTIONS}
                size="sm"
                ariaLabel="Row metric"
              />
            }
          />
          <StateView {...stateProps} emptyTitle="No row data" minHeight={220}>
            <BarChart
              labels={rowBars.labels}
              series={rowBars.series}
              formatValue={rowBars.formatValue}
              height={220}
            />
          </StateView>
        </Card>
      </div>

      {/* 5 & 6) Same-finger bigram + hand alternation */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Same-finger bigrams" subtitle="Two consecutive keys typed by the same finger." />
          <StateView {...stateProps} emptyTitle="No same-finger data" minHeight={220}>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="Bigrams" value={formatNumber(analysis?.sameFingerBigram.count ?? 0)} />
              <StatTile label="Median IKI" value={formatMs(analysis?.sameFingerBigram.medianMs ?? 0)} />
              <StatTile
                label="Error rate"
                value={formatPercent((analysis?.sameFingerBigram.errorRate ?? 0) * 100)}
                tone={(analysis?.sameFingerBigram.errorRate ?? 0) > 0.05 ? 'error' : 'neutral'}
              />
            </div>
            <p className="mt-3 text-xs text-[var(--sub)]">
              When the same finger types two keys in a row, it costs a repositioning movement.
            </p>
          </StateView>
        </Card>

        <Card>
          <CardHeader title="Hand alternation" subtitle="Alternating vs same-hand key pairs." />
          <StateView {...stateProps} emptyTitle="No alternation data" minHeight={220}>
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                label="Alternating"
                value={formatMs(analysis?.handAlternation.alternatingMedianMs ?? 0)}
                tone="ok"
              />
              <StatTile label="Same hand" value={formatMs(analysis?.handAlternation.sameHandMedianMs ?? 0)} />
            </div>
            <div className="mt-3">
              <BarChart
                labels={['Alternating', 'Same hand']}
                series={[
                  {
                    label: 'Median IKI',
                    data: [
                      analysis?.handAlternation.alternatingMedianMs ?? 0,
                      analysis?.handAlternation.sameHandMedianMs ?? 0,
                    ],
                  },
                ]}
                formatValue={(v) => formatMs(v)}
                height={140}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--sub)]">
              Alternating hands is usually faster than same-hand sequences.
            </p>
          </StateView>
        </Card>
      </div>

      {/* 7) IKI histogram */}
      <Card>
        <CardHeader
          title="Inter-key interval distribution"
          subtitle="How inter-key intervals (ms) are distributed across all keystrokes."
        />
        <StateView {...stateProps} emptyTitle="No IKI data" minHeight={220}>
          <BarChart
            labels={ikiHist.labels}
            series={ikiHist.series}
            formatValue={ikiHist.formatValue}
            height={220}
          />
        </StateView>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Local helper — small labeled value tile used in the cost cards.
 * ------------------------------------------------------------------------- */
function StatTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'main' | 'error' | 'ok';
}) {
  const toneCls =
    tone === 'main'
      ? 'text-[var(--main)]'
      : tone === 'error'
        ? 'text-[var(--error)]'
        : tone === 'ok'
          ? 'text-[var(--ok)]'
          : 'text-[var(--text)]';
  return (
    <div className="rounded-md border border-[var(--sub-2)] bg-[var(--bg-elev)] p-3">
      <div className="text-[10px] uppercase tracking-wide text-[var(--sub)]">{label}</div>
      <div className={cn('mt-1 text-lg font-bold tnum', toneCls)}>{value}</div>
    </div>
  );
}
