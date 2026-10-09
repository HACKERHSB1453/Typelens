import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardHeader } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { SortableTable, type Column } from '@/components/ui/SortableTable';
import { StateView } from '@/components/ui/StateView';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LineChart, type LineSeries } from '@/components/charts/LineChart';
import { CHART_COLORS } from '@/components/charts/chartTheme';
import { Heatmap } from '@/components/charts/Heatmap';
import { useFilters } from '@/hooks/useFilters';
import { useAnalysis, useProgress, useSessions } from '@/hooks/useData';
import {
  formatNumber,
  formatMs,
  formatPercent,
  formatCompact,
  formatDuration,
  formatDateTime,
  formatDate,
} from '@/lib/utils';
import type { KeyStat, NgramStat, SessionSummary } from '@/data/types';

/**
 * Overview page — top-level KPI snapshot, WPM/accuracy trend, recent sessions
 * table, 12-month activity heatmap, and the weakest bigrams/keys with direct
 * "practice this" actions.
 */
export function Overview() {
  const { filters } = useFilters();
  const navigate = useNavigate();

  const analysis = useAnalysis(filters);
  const progress = useProgress(filters);
  const sessions = useSessions(filters);
  const allSessions = useSessions(); // all-time, for the heatmap

  // Trend chart ------------------------------------------------------------
  const points = progress.data?.points ?? [];
  const trendLabels = points.map((p) => p.date.slice(5)); // MM-DD
  const trendSeries: LineSeries[] = [
    { label: 'WPM', data: points.map((p) => p.avgWpm), color: CHART_COLORS.main },
    { label: 'Accuracy', data: points.map((p) => p.avgAcc), color: CHART_COLORS.ok },
  ];

  // Recent sessions table — ~15 most recent by startedAt ------------------
  const recentSessions = useMemo<SessionSummary[]>(() => {
    if (!sessions.data) return [];
    return [...sessions.data].sort((a, b) => b.startedAt - a.startedAt).slice(0, 15);
  }, [sessions.data]);

  // Heatmap — daily session counts (all-time) -----------------------------
  const heatmapCounts = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const s of allSessions.data ?? []) {
      const k = formatDate(s.startedAt);
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [allSessions.data]);

  // Weakest spots ----------------------------------------------------------
  const weakBigrams = useMemo<NgramStat[]>(() => (analysis.data?.bigrams ?? []).slice(0, 5), [analysis.data]);
  const weakKeys = useMemo<KeyStat[]>(() => {
    const ks = analysis.data?.keys ?? [];
    return [...ks].sort((a, b) => b.errorRate - a.errorRate).slice(0, 5);
  }, [analysis.data]);

  const columns: Column<SessionSummary>[] = [
    { key: 'startedAt', header: 'Date', cell: (r) => formatDateTime(r.startedAt), sortValue: (r) => r.startedAt },
    {
      key: 'mode',
      header: 'Mode',
      cell: (r) => (
        <span>
          {r.config.mode} {r.config.mode2}
          {!r.completed && (
            <Badge tone="sub" className="ml-2">
              restarted
            </Badge>
          )}
        </span>
      ),
      sortValue: (r) => `${r.config.mode} ${r.config.mode2}`,
    },
    { key: 'language', header: 'Lang', cell: (r) => r.config.language, sortValue: (r) => r.config.language },
    {
      key: 'wpm',
      header: 'WPM',
      cell: (r) => (r.completed ? formatNumber(r.wpm, 1) : <span className="text-[var(--sub)]">—</span>),
      sortValue: (r) => r.wpm,
      align: 'right',
    },
    {
      key: 'acc',
      header: 'Accuracy',
      cell: (r) => formatPercent(r.acc),
      sortValue: (r) => r.acc,
      align: 'right',
    },
    {
      key: 'consistency',
      header: 'Consistency',
      cell: (r) => (r.completed ? formatPercent(r.consistency, 0) : <span className="text-[var(--sub)]">—</span>),
      sortValue: (r) => r.consistency,
      align: 'right',
    },
    {
      key: 'durationSec',
      header: 'Duration',
      cell: (r) => formatDuration(r.durationSec),
      sortValue: (r) => r.durationSec,
      align: 'right',
    },
    {
      key: 'keystrokes',
      header: 'Keystrokes',
      cell: (r) => formatCompact(r.keystrokes),
      sortValue: (r) => r.keystrokes,
      align: 'right',
    },
  ];

  const a = analysis.data;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Overview</h1>

      {/* 1) KPI cards ----------------------------------------------------- */}
      <StateView
        loading={analysis.loading}
        error={analysis.error}
        empty={!a}
        onRetry={analysis.retry}
        emptyTitle="No analysis yet"
        emptyHint="Complete a few typing sessions to surface your KPIs."
      >
        {a && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <KpiCard label="WPM" value={formatNumber(a.overall.wpm, 1)} hint="time-weighted average" tone="main" />
          <KpiCard label="Raw WPM" value={formatNumber(a.overall.rawWpm, 1)} hint="uncorrected speed" />
          <KpiCard label="Accuracy" value={formatPercent(a.overall.acc)} hint="hit vs miss" />
          <KpiCard label="Consistency" value={formatPercent(a.overall.consistency, 0)} />
          <KpiCard label="Sessions" value={formatNumber(a.sessions)} />
          <KpiCard
            label="Minutes practiced"
            value={`${formatNumber(a.minutes, 1)}m`}
            hint={formatDuration(a.minutes * 60)}
          />
          <KpiCard label="Keystrokes" value={formatCompact(a.keystrokes)} />
          <KpiCard label="Median inter-key" value={formatMs(a.overall.medianIkiMs)} hint="two-key interval" />
          <KpiCard label="Median hold" value={formatMs(a.overall.medianHoldMs)} hint="single-key hold" />
          <KpiCard
            label="Rollover rate"
            value={formatPercent(a.overall.rolloverRate * 100)}
            hint="anticipatory typing"
          />
          </div>
        )}
      </StateView>

      {/* 2) WPM + accuracy trend ----------------------------------------- */}
      <Card>
        <CardHeader title="WPM & accuracy trend" subtitle="Daily averages over the selected range" />
        <StateView
          loading={progress.loading}
          error={progress.error}
          empty={points.length === 0}
          onRetry={progress.retry}
          emptyTitle="No progress data"
          emptyHint="Try a wider range or complete a few sessions."
          minHeight={220}
        >
          <LineChart labels={trendLabels} series={trendSeries} height={260} />
        </StateView>
      </Card>

      {/* 3) Recent sessions table ---------------------------------------- */}
      <Card>
        <CardHeader
          title="Recent sessions"
          subtitle="Latest 15 sessions — click a row to replay"
          right={
            <Link to="/replay">
              <Button variant="ghost" size="sm">
                View all →
              </Button>
            </Link>
          }
        />
        <StateView
          loading={sessions.loading}
          error={sessions.error}
          empty={!sessions.data || sessions.data?.length === 0}
          onRetry={sessions.retry}
          emptyTitle="No sessions yet"
          emptyHint="Import or complete a typing session to populate the table."
        >
          <SortableTable
            columns={columns}
            rows={recentSessions}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/replay/${encodeURIComponent(r.id)}`)}
            initialSort={{ key: 'startedAt', dir: 'desc' }}
            maxRowsVisible={15}
            emptyHint="No sessions in this range."
          />
        </StateView>
      </Card>

      {/* 4) Activity heatmap with streak ---------------------------------- */}
      <Card>
        <CardHeader title="Activity" subtitle="Sessions per day, last ~12 months" />
        <StateView
          loading={allSessions.loading}
          error={allSessions.error}
          empty={!allSessions.data || allSessions.data?.length === 0}
          onRetry={allSessions.retry}
          emptyTitle="No activity yet"
          emptyHint="Complete a session to start your streak."
        >
          <Heatmap counts={heatmapCounts} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="main">Current streak: {progress.data?.currentStreakDays ?? 0}d</Badge>
            <Badge tone="sub">Longest: {progress.data?.longestStreakDays ?? 0}d</Badge>
          </div>
        </StateView>
      </Card>

      {/* 5) Weakest spots ------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Weakest spots"
          subtitle="Top 5 bigrams and keys — practice them directly"
        />
        <StateView
          loading={analysis.loading}
          error={analysis.error}
          empty={!a || a.bigrams.length === 0}
          onRetry={analysis.retry}
          emptyTitle="No weak spots detected"
          emptyHint="Complete more sessions to surface bigram/key difficulty."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Bigrams */}
            <div className="rounded-lg border border-[var(--sub-2)] p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--sub)]">
                Bigrams
              </p>
              <ul className="space-y-2">
                {weakBigrams.map((b) => (
                  <li key={b.gram} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3 text-xs">
                      <span className="font-bold text-[var(--text)]">{b.gram}</span>
                      <span className="text-[var(--sub)]">×{b.count}</span>
                      <span className="text-[var(--text)]">cost {formatMs(b.costMs)}</span>
                      <span className={b.errorRate > 0 ? 'text-[var(--error)]' : 'text-[var(--sub)]'}>
                        {formatPercent(b.errorRate * 100)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(
                          `/practice?focus=grams&grams=${encodeURIComponent(b.gram)}`,
                        )
                      }
                    >
                      Practice this
                    </Button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Keys */}
            <div className="rounded-lg border border-[var(--sub-2)] p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--sub)]">
                Keys
              </p>
              <ul className="space-y-2">
                {weakKeys.map((k) => (
                  <li key={k.code} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3 text-xs">
                      <span className="font-bold text-[var(--text)]">
                        {k.char || k.code}
                      </span>
                      <span className="text-[var(--sub)]">{k.finger}</span>
                      <span className={k.errorRate > 0 ? 'text-[var(--error)]' : 'text-[var(--sub)]'}>
                        {formatPercent(k.errorRate * 100)}
                      </span>
                      <span className="text-[var(--text)]">
                        iki {formatMs(k.medianIkiMs)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(
                          `/practice?focus=keys&codes=${encodeURIComponent(k.code)}`,
                        )
                      }
                    >
                      Practice this
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </StateView>
      </Card>
    </div>
  );
}
