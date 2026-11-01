import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lightbulb, Target, Trophy, TrendingDown, TrendingUp, Info } from 'lucide-react';
import { buildInsights, comparePeriods, goalProgress, personalBestIds, personalBests, type Insight } from '@typelens/core';
import { PageHeader } from '@/components/ui/PageHeader';
import { useGoals } from '@/hooks/useGoals';
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
  formatDayLabel,
} from '@/lib/utils';
import type { KeyStat, NgramStat, SessionSummary } from '@/data/types';

/**
 * Overview page — top-level KPI snapshot, WPM/accuracy trend, recent sessions
 * table, 12-month activity heatmap, and the weakest bigrams/keys with direct
 * "practice this" actions.
 */
export function Overview() {
  const { filters, rangePreset } = useFilters();
  const navigate = useNavigate();
  const goals = useGoals();

  const analysis = useAnalysis(filters);
  const progress = useProgress(filters);
  const sessions = useSessions(filters);
  // the same mode/language filters over all time: the heatmap, records, goals and the previous-period comparison
  const allSessions = useSessions({ ...filters, from: undefined, to: undefined });

  const now = Date.now();
  const rangeLabel = rangePreset === 'all' ? 'all time' : `the last ${rangePreset.replace('d', ' days')}`;
  const comparison = useMemo(
    () => (allSessions.data && filters.from !== undefined ? comparePeriods(allSessions.data, filters.from, now) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSessions.data, filters.from],
  );
  const insights = useMemo<Insight[]>(() => {
    if (!allSessions.data) return [];
    const from = filters.from ?? now - 30 * 86_400_000;
    return buildInsights(allSessions.data, from, now, now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSessions.data, filters.from]);
  const records = useMemo(() => personalBests(allSessions.data ?? []).slice(0, 6), [allSessions.data]);
  const pbIds = useMemo(() => personalBestIds(allSessions.data ?? []), [allSessions.data]);
  const goal = useMemo(
    () => (allSessions.data && goals ? goalProgress(allSessions.data, goals, now) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSessions.data, goals],
  );
  const vs = rangePreset === 'all' ? undefined : `vs previous ${rangePreset.replace('d', ' days')}`;
  const deltaFor = (key: 'wpm' | 'acc' | 'consistency' | 'sessions' | 'minutes', format: (v: number) => string, epsilon = 0) =>
    // nothing before the window (a new user, or demo data): a "+60 sessions" would only be noise
    comparison && comparison.previous.sessions > 0 && comparison.delta[key] !== null
      ? { value: comparison.delta[key], format, label: vs, epsilon }
      : undefined;

  // Trend chart ------------------------------------------------------------
  const points = progress.data?.points ?? [];
  const trendLabels = points.map((p) => formatDayLabel(p.date));
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
          {pbIds.has(r.id) && (
            <Badge tone="main" className="ml-2">
              <Trophy className="mr-1 h-3 w-3" aria-hidden />
              PB
            </Badge>
          )}
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
      <PageHeader
        title="Overview"
        description={`Your typing over ${rangeLabel}${a ? ` · ${formatNumber(a.sessions)} tests` : ''}. Change the range and modes in the filter bar above.`}
        actions={
          <Button variant="primary" size="md" onClick={() => navigate('/practice')}>
            <Target className="h-3.5 w-3.5" aria-hidden />
            Practise weak spots
          </Button>
        }
      />

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
            <KpiCard
              label="WPM"
              value={formatNumber(a.overall.wpm, 1)}
              hint="time-weighted average"
              tone="main"
              delta={deltaFor('wpm', (v) => `${formatNumber(v, 1)} wpm`, 0.05)}
            />
          <KpiCard label="Raw WPM" value={formatNumber(a.overall.rawWpm, 1)} hint="uncorrected speed" />
          <KpiCard
            label="Accuracy"
            value={formatPercent(a.overall.acc)}
            hint="hit vs miss"
            delta={deltaFor('acc', (v) => `${formatNumber(v, 1)} pts`, 0.05)}
          />
          <KpiCard
            label="Consistency"
            value={formatPercent(a.overall.consistency, 0)}
            delta={deltaFor('consistency', (v) => `${formatNumber(v, 0)} pts`, 0.5)}
          />
          <KpiCard label="Sessions" value={formatNumber(a.sessions)} delta={deltaFor('sessions', (v) => formatNumber(v))} />
          <KpiCard
            label="Minutes practiced"
            value={`${formatNumber(a.minutes, 1)}m`}
            hint={formatDuration(a.minutes * 60)}
            delta={deltaFor('minutes', (v) => `${formatNumber(v, 0)}m`, 0.5)}
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

      {/* Insights and goals -------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-[var(--main)]" aria-hidden /> Insights
              </span>
            }
            subtitle={`What changed over ${rangeLabel === 'all time' ? 'the last 30 days' : rangeLabel}`}
          />
          {insights.length === 0 ? (
            <p className="text-xs text-[var(--sub)]">
              Take a few more tests. Insights appear once there is enough data to compare.
            </p>
          ) : (
            <ul className="space-y-2">
              {insights.map((i) => {
                const Icon = i.tone === 'good' ? TrendingUp : i.tone === 'bad' ? TrendingDown : Info;
                return (
                  <li key={i.text} className="flex items-start gap-2.5 rounded-md bg-[var(--bg-elev)] px-3 py-2 text-xs leading-relaxed">
                    <Icon
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${i.tone === 'bad' ? 'text-[var(--error)]' : i.tone === 'good' ? 'text-[var(--main)]' : 'text-[var(--sub)]'}`}
                      aria-hidden
                    />
                    <span className="text-[var(--text)]">{i.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Target className="h-4 w-4 text-[var(--main)]" aria-hidden /> Goals
              </span>
            }
            subtitle="This week"
            right={
              <Link to="/settings#goals" className="text-[11px] text-[var(--sub)] underline-offset-2 hover:text-[var(--text)] hover:underline">
                Edit
              </Link>
            }
          />
          {goal && goals ? (
            <div className="space-y-4">
              <GoalBar
                label="Practice time"
                value={`${formatNumber(goal.weekMinutes, 0)} / ${goals.weeklyMinutes || '–'} min`}
                ratio={goal.weekRatio}
                empty="No weekly goal set."
              />
              <GoalBar
                label="Speed (7-day average)"
                value={`${goal.recentWpm === null ? '–' : formatNumber(goal.recentWpm, 1)} / ${goals.targetWpm || '–'} wpm`}
                ratio={goal.wpmRatio}
                empty="Set a target WPM in Settings."
              />
            </div>
          ) : (
            <p className="text-xs text-[var(--sub)]">Loading…</p>
          )}
        </Card>
      </div>

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

      {/* Personal bests ------------------------------------------------- */}
      {records.length > 0 && (
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Trophy className="h-4 w-4 text-[var(--main)]" aria-hidden /> Personal bests
              </span>
            }
            subtitle="Fastest finished test per mode, all time (with the filter bar's modes and languages)"
          />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {records.map((r) => (
              <button
                key={r.key}
                onClick={() => navigate(`/replay/${encodeURIComponent(r.best.id)}`)}
                className="rounded-md border border-[var(--sub-2)] p-3 text-left transition-colors hover:border-[var(--sub)] hover:bg-[var(--bg-elev)]"
                title="Open the replay"
              >
                <div className="truncate text-[11px] uppercase tracking-wider text-[var(--sub)]">{r.key}</div>
                <div className="mt-1 text-xl font-bold tnum text-[var(--text)]">
                  {formatNumber(r.best.wpm, 1)}
                  <span className="ml-1 text-[11px] font-normal text-[var(--sub)]">wpm</span>
                </div>
                <div className="mt-1 text-[11px] text-[var(--sub)]">
                  {formatPercent(r.best.acc)} · {formatDateTime(r.best.startedAt).split(',')[0]} · {r.tests} tests
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

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
        <CardHeader title="Activity" subtitle="Tests per day over the last 12 months" />
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

function GoalBar({ label, value, ratio, empty }: { label: string; value: string; ratio: number | null; empty: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-[var(--sub)]">{label}</span>
        <span className="font-semibold tnum text-[var(--text)]">{ratio === null ? '' : value}</span>
      </div>
      {ratio === null ? (
        <p className="text-[11px] text-[var(--sub)]">{empty}</p>
      ) : (
        <>
          <div
            className="h-2 overflow-hidden rounded-full bg-[var(--bg-elev)]"
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
          >
            <div className="h-full rounded-full bg-[var(--main)] transition-[width] duration-500" style={{ width: `${Math.max(2, ratio * 100)}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-[var(--sub)]">{ratio >= 1 ? 'Goal reached. Nice work.' : `${Math.round(ratio * 100)}% of your goal`}</div>
        </>
      )}
    </div>
  );
}
