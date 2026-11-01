import { PageHeader } from '@/components/ui/PageHeader';
import { Flame, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { useFilters } from '@/hooks/useFilters';
import { useProgress } from '@/hooks/useData';
import { Card, CardHeader } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { StateView } from '@/components/ui/StateView';
import { Badge } from '@/components/ui/Badge';
import { LineChart } from '@/components/charts/LineChart';
import { BarChart } from '@/components/charts/BarChart';
import { CHART_COLORS } from '@/components/charts/chartTheme';
import { formatDayLabel, formatMs, formatNumber } from '@/lib/utils';
import type { GramTrend } from '@/data/types';

/**
 * Progress page — daily trend charts (WPM / accuracy / consistency / minutes),
 * streak KPIs, and the improved vs regressed n-gram lists, all driven by the
 * shared useProgress hook.
 */
export function Progress() {
  const { filters } = useFilters();
  const { data: progress, loading, error, retry } = useProgress(filters);

  const empty = !progress || progress.points.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Progress" description="Long-term speed, accuracy, consistency and practice time, plus what improved and what got worse." />

      <StateView
        loading={loading}
        error={error}
        empty={empty}
        onRetry={retry}
        emptyTitle="No progress yet"
        emptyHint="No sessions match the current filters — adjust the range or filters to see trends."
      >
        {progress && (
          <div className="flex flex-col gap-6">
            {/* Streak cards */}
            <div className="grid grid-cols-2 gap-3">
              <KpiCard
                label="Current streak"
                value={`${progress.currentStreakDays} days`}
                tone={progress.currentStreakDays > 0 ? 'main' : 'neutral'}
                icon={<Flame className="h-4 w-4" aria-hidden />}
              />
              <KpiCard
                label="Longest streak"
                value={`${progress.longestStreakDays} days`}
                tone="neutral"
                icon={<Trophy className="h-4 w-4" aria-hidden />}
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card>
                <CardHeader title="WPM over time" subtitle="Daily average WPM" />
                <LineChart
                  labels={progress.points.map((p) => formatDayLabel(p.date))}
                  series={[
                    { label: 'WPM', data: progress.points.map((p) => p.avgWpm), color: CHART_COLORS.main },
                  ]}
                  yLabel="WPM"
                  formatY={(v) => formatNumber(v, 0)}
                />
              </Card>
              <Card>
                <CardHeader title="Accuracy over time" subtitle="Daily average accuracy" />
                <LineChart
                  labels={progress.points.map((p) => formatDayLabel(p.date))}
                  series={[
                    { label: 'Accuracy', data: progress.points.map((p) => p.avgAcc), color: CHART_COLORS.ok },
                  ]}
                  yLabel="Accuracy"
                  yMin={0}
                  yMax={100}
                  formatY={(v) => `${formatNumber(v, 0)}%`}
                />
              </Card>
              <Card>
                <CardHeader title="Consistency over time" subtitle="Daily average consistency" />
                <LineChart
                  labels={progress.points.map((p) => formatDayLabel(p.date))}
                  series={[
                    {
                      label: 'Consistency',
                      data: progress.points.map((p) => p.avgConsistency),
                      color: CHART_COLORS.accent2,
                    },
                  ]}
                  yLabel="Consistency"
                  yMin={0}
                  yMax={100}
                  formatY={(v) => `${formatNumber(v, 0)}%`}
                />
              </Card>
              <Card>
                <CardHeader title="Minutes per day" subtitle="Active typing time" />
                <BarChart
                  labels={progress.points.map((p) => formatDayLabel(p.date))}
                  series={[
                    { label: 'Minutes', data: progress.points.map((p) => p.minutes), color: CHART_COLORS.main },
                  ]}
                  formatValue={(v) => (Number.isInteger(v) ? String(v) : formatNumber(v, 1))}
                />
              </Card>
            </div>

            {/* Improved vs Regressed */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-[var(--ok)]" aria-hidden />
                      Improved
                    </span>
                  }
                  subtitle="N-grams that got faster in this range."
                />
                <GramTrendList trends={progress.improved} tone="ok" />
              </Card>
              <Card>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-[var(--error)]" aria-hidden />
                      Regressed
                    </span>
                  }
                  subtitle="N-grams that got slower in this range."
                />
                <GramTrendList trends={progress.regressed} tone="error" />
              </Card>
            </div>
          </div>
        )}
      </StateView>
    </div>
  );
}

function GramTrendList({ trends, tone }: { trends: GramTrend[]; tone: 'ok' | 'error' }) {
  if (trends.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--sub-2)] p-4 text-center text-xs text-[var(--sub)]">
        No significant changes in this range.
      </div>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-[var(--sub-2)]">
      {trends.map((t) => (
        <li key={t.gram} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
          <span className="font-mono font-bold text-[var(--text)]">{t.gram}</span>
          <span className="text-[var(--sub)] tnum">
            {formatMs(t.firstMs)} <span aria-hidden>→</span> {formatMs(t.lastMs)}
          </span>
          <Badge tone={tone} className="tnum">
            {formatMs(t.deltaMs)}
          </Badge>
          <span className="text-xs text-[var(--sub)]">×{t.count}</span>
        </li>
      ))}
    </ul>
  );
}
