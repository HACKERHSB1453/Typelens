/** Sessions -> long-term progress: daily trend, streaks, and which n-grams got faster or slower. */
import type { AnalysisFilters, GramTrend, Keystroke, ProgressPoint, ProgressSeries, Session } from './schema';
import { DEFAULT_MIN_SAMPLES, selectSessions, sessionSeconds, sessionStats } from './analyze';
import { deriveKeystrokes } from './derive';
import { ngramHits } from './ngrams';
import { median, round } from './stats-util';

const DAY_MS = 86_400_000;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local calendar date, YYYY-MM-DD. */
export function localDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole-day index of a YYYY-MM-DD string (DST-proof: computed in UTC). */
function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function streaks(dates: readonly string[], today: string): { current: number; longest: number } {
  const days = [...new Set(dates.map(dayNumber))].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev = Number.NEGATIVE_INFINITY;
  for (const d of days) {
    run = d === prev + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const set = new Set(days);
  const t = dayNumber(today);
  let cursor = set.has(t) ? t : set.has(t - 1) ? t - 1 : Number.NaN; // a streak survives until the end of the next day
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor--;
  }
  return { current, longest };
}

function gramMedians(sessions: readonly Session[], perSession: Map<Session, Keystroke[]>, includeSpace: boolean): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (const s of sessions) {
    for (const h of ngramHits(perSession.get(s) ?? [], 2, includeSpace)) {
      const arr = m.get(h.gram) ?? m.set(h.gram, []).get(h.gram)!;
      arr.push(h.ms);
    }
  }
  return m;
}

export function buildProgress(sessions: readonly Session[], filters: AnalysisFilters = {}, now = 0): ProgressSeries {
  const minSamples = filters.minSamples ?? DEFAULT_MIN_SAMPLES;
  const picked = selectSessions(sessions, filters).sort((a, b) => a.startedAt - b.startedAt);
  const derived = new Map<Session, Keystroke[]>(picked.map((s) => [s, deriveKeystrokes(s)]));

  // ---- daily points, duration-weighted
  interface Day { sessions: number; seconds: number; wsum: number; wpm: number; acc: number; cons: number }
  const byDate = new Map<string, Day>();
  // daily trend = finished tests only (a restart after a few keys would drag the day's average towards 0)
  for (const s of picked.filter((x) => x.completed)) {
    const ks = derived.get(s) as Keystroke[];
    const st = sessionStats(s, ks);
    const seconds = sessionSeconds(s, ks);
    const w = seconds > 0 ? seconds : 1;
    const wpm = s.result?.wpm ?? st.wpm;
    const acc = s.result?.acc ?? st.acc;
    const cons = s.result?.consistency ?? st.consistency;
    const date = localDate(s.startedAt);
    const d = byDate.get(date) ?? byDate.set(date, { sessions: 0, seconds: 0, wsum: 0, wpm: 0, acc: 0, cons: 0 }).get(date)!;
    d.sessions++;
    d.seconds += seconds;
    d.wpm += wpm * w;
    d.acc += acc * w;
    d.cons += cons * w;
    d.wsum += w;
  }
  const points: ProgressPoint[] = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => {
      return { date, sessions: d.sessions, minutes: round(d.seconds / 60, 2), avgWpm: round(d.wpm / d.wsum), avgAcc: round(d.acc / d.wsum), avgConsistency: round(d.cons / d.wsum) };
    });

  const st = streaks(points.map((p) => p.date), localDate(now));

  // ---- gram trends: earliest third vs latest third of the time range
  let improved: GramTrend[] = [];
  let regressed: GramTrend[] = [];
  if (picked.length >= 2) {
    const t0 = (picked[0] as Session).startedAt;
    const t1 = (picked[picked.length - 1] as Session).startedAt;
    const cutLo = t0 + (t1 - t0) / 3;
    const cutHi = t0 + (2 * (t1 - t0)) / 3;
    const early = gramMedians(picked.filter((s) => s.startedAt <= cutLo), derived, filters.includeSpaceNgrams ?? false);
    const late = gramMedians(picked.filter((s) => s.startedAt >= cutHi), derived, filters.includeSpaceNgrams ?? false);
    const trends: GramTrend[] = [];
    for (const [gram, a] of early) {
      const b = late.get(gram);
      if (!b || a.length < minSamples || b.length < minSamples) continue;
      const firstMs = median(a);
      const lastMs = median(b);
      trends.push({ gram, firstMs: round(firstMs), lastMs: round(lastMs), deltaMs: round(lastMs - firstMs), count: a.length + b.length });
    }
    improved = trends.filter((t) => t.deltaMs < 0).sort((x, y) => x.deltaMs - y.deltaMs || x.gram.localeCompare(y.gram)).slice(0, 10);
    regressed = trends.filter((t) => t.deltaMs > 0).sort((x, y) => y.deltaMs - x.deltaMs || x.gram.localeCompare(y.gram)).slice(0, 10);
  }

  return { points, currentStreakDays: st.current, longestStreakDays: st.longest, improved, regressed };
}
