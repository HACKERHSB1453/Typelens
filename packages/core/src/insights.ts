/**
 * Summary-level statistics that need no keystrokes: period comparisons, personal bests, goals, time of day and
 * plain-language insights. Everything works on SessionSummary lists, so it is cheap and runs on demo data too.
 */
import type { SessionSummary } from './schema';

const DAY = 86_400_000;

/** A test counts for records and averages when it finished and its capture agrees with Monkeytype. */
export function isCountable(s: SessionSummary): boolean {
  return s.completed && !s.flags.includes('captureUnreliable') && s.durationSec > 0;
}

export interface PeriodStats {
  sessions: number;
  minutes: number;
  /** duration-weighted averages over countable tests; null when there are none */
  wpm: number | null;
  acc: number | null;
  consistency: number | null;
}

export function periodStats(list: SessionSummary[]): PeriodStats {
  let minutes = 0;
  let w = 0;
  let wpm = 0;
  let acc = 0;
  let cons = 0;
  for (const s of list) {
    minutes += s.durationSec / 60;
    if (!isCountable(s)) continue;
    w += s.durationSec;
    wpm += s.wpm * s.durationSec;
    acc += s.acc * s.durationSec;
    cons += s.consistency * s.durationSec;
  }
  return {
    sessions: list.length,
    minutes,
    wpm: w > 0 ? wpm / w : null,
    acc: w > 0 ? acc / w : null,
    consistency: w > 0 ? cons / w : null,
  };
}

export interface PeriodComparison {
  current: PeriodStats;
  previous: PeriodStats;
  /** current minus previous; null when either side has no value */
  delta: { sessions: number; minutes: number; wpm: number | null; acc: number | null; consistency: number | null };
}

const diff = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a - b);

/** Compares [from, to) with the window of the same length right before it. */
export function comparePeriods(all: SessionSummary[], from: number, to: number): PeriodComparison {
  const len = to - from;
  const current = periodStats(all.filter((s) => s.startedAt >= from && s.startedAt < to));
  const previous = periodStats(all.filter((s) => s.startedAt >= from - len && s.startedAt < from));
  return {
    current,
    previous,
    delta: {
      sessions: current.sessions - previous.sessions,
      minutes: current.minutes - previous.minutes,
      wpm: diff(current.wpm, previous.wpm),
      acc: diff(current.acc, previous.acc),
      consistency: diff(current.consistency, previous.consistency),
    },
  };
}

export interface PersonalBest {
  /** "time 30", "words 50", "quote", ... */
  key: string;
  best: SessionSummary;
  tests: number;
}

export const modeKey = (s: SessionSummary): string => [s.config.mode, s.config.mode2].filter(Boolean).join(' ');

/** The fastest countable test per mode, most played modes first. */
export function personalBests(all: SessionSummary[]): PersonalBest[] {
  const m = new Map<string, PersonalBest>();
  for (const s of all) {
    if (!isCountable(s)) continue;
    const key = modeKey(s);
    const cur = m.get(key);
    if (!cur) m.set(key, { key, best: s, tests: 1 });
    else {
      cur.tests++;
      if (s.wpm > cur.best.wpm) cur.best = s;
    }
  }
  return [...m.values()].sort((a, b) => b.tests - a.tests || b.best.wpm - a.best.wpm);
}

/** Ids of tests that set a new personal best for their mode when they were taken (the first test of a mode does not count). */
export function personalBestIds(all: SessionSummary[]): Set<string> {
  const best = new Map<string, number>();
  const out = new Set<string>();
  for (const s of [...all].sort((a, b) => a.startedAt - b.startedAt)) {
    if (!isCountable(s)) continue;
    const key = modeKey(s);
    const prev = best.get(key);
    if (prev === undefined) best.set(key, s.wpm);
    else if (s.wpm > prev) {
      best.set(key, s.wpm);
      out.add(s.id);
    }
  }
  return out;
}

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';
export const DAY_PARTS: readonly DayPart[] = ['morning', 'afternoon', 'evening', 'night'];

export function dayPart(ts: number): DayPart {
  const h = new Date(ts).getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

export interface DayPartStats {
  part: DayPart;
  sessions: number;
  wpm: number | null;
  acc: number | null;
}

export function byDayPart(all: SessionSummary[]): DayPartStats[] {
  return DAY_PARTS.map((part) => {
    const st = periodStats(all.filter((s) => dayPart(s.startedAt) === part));
    return { part, sessions: st.sessions, wpm: st.wpm, acc: st.acc };
  });
}

/** Local midnight of the Monday of the week containing `now`. */
export function startOfWeek(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const sinceMonday = (d.getDay() + 6) % 7;
  return d.getTime() - sinceMonday * DAY;
}

export interface Goals {
  /** minutes of typing per week (Monday to Sunday); 0 = no goal */
  weeklyMinutes: number;
  /** target WPM, compared with the last 7 days' average; 0 = no goal */
  targetWpm: number;
}

export const DEFAULT_GOALS: Goals = { weeklyMinutes: 60, targetWpm: 0 };

export function sanitizeGoals(x: unknown): Goals {
  const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const num = (v: unknown, max: number, dflt: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : dflt;
  return {
    weeklyMinutes: num(r.weeklyMinutes, 10_000, DEFAULT_GOALS.weeklyMinutes),
    targetWpm: num(r.targetWpm, 400, DEFAULT_GOALS.targetWpm),
  };
}

export interface GoalProgress {
  weekMinutes: number;
  /** 0..1, null without a goal */
  weekRatio: number | null;
  /** duration-weighted WPM over the last 7 days */
  recentWpm: number | null;
  wpmRatio: number | null;
}

export function goalProgress(all: SessionSummary[], goals: Goals, now: number): GoalProgress {
  const week = periodStats(all.filter((s) => s.startedAt >= startOfWeek(now) && s.startedAt <= now));
  const recent = periodStats(all.filter((s) => s.startedAt >= now - 7 * DAY && s.startedAt <= now));
  return {
    weekMinutes: week.minutes,
    weekRatio: goals.weeklyMinutes > 0 ? Math.min(1, week.minutes / goals.weeklyMinutes) : null,
    recentWpm: recent.wpm,
    wpmRatio: goals.targetWpm > 0 && recent.wpm !== null ? Math.min(1, recent.wpm / goals.targetWpm) : null,
  };
}

export interface Insight {
  tone: 'good' | 'bad' | 'neutral';
  text: string;
}

const pct = (a: number, b: number): number => ((a - b) / b) * 100;
const r1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/**
 * A few plain-language observations, most useful first. `from`/`to` is the selected window; the comparison
 * window is the same length before it. Every insight needs enough data behind it, so new users see fewer.
 */
export function buildInsights(all: SessionSummary[], from: number, to: number, now = Date.now()): Insight[] {
  const out: Insight[] = [];
  const cmp = comparePeriods(all, from, to);
  const { current: cur, previous: prev } = cmp;

  if (cur.wpm !== null && prev.wpm !== null && cur.sessions >= 3 && prev.sessions >= 3) {
    const p = pct(cur.wpm, prev.wpm);
    if (Math.abs(p) >= 2) {
      out.push({
        tone: p > 0 ? 'good' : 'bad',
        text: `Your speed is ${p > 0 ? 'up' : 'down'} ${r1(Math.abs(p))}% (${r1(prev.wpm)} → ${r1(cur.wpm)} WPM) compared with the period before.`,
      });
    } else out.push({ tone: 'neutral', text: `Your speed is steady at about ${Math.round(cur.wpm)} WPM.` });
  }
  if (cur.acc !== null && prev.acc !== null && cur.sessions >= 3 && prev.sessions >= 3) {
    const d = cur.acc - prev.acc;
    if (Math.abs(d) >= 0.5)
      out.push({
        tone: d > 0 ? 'good' : 'bad',
        text: `Accuracy ${d > 0 ? 'improved' : 'dropped'} by ${r1(Math.abs(d))} points to ${r1(cur.acc)}%.`,
      });
  }

  const inWindow = all.filter((s) => s.startedAt >= from && s.startedAt < to);
  const pbs = personalBestIds(all);
  const newPbs = inWindow.filter((s) => pbs.has(s.id)).length;
  if (newPbs > 0) out.push({ tone: 'good', text: `You set ${newPbs} new personal best${newPbs === 1 ? '' : 's'} in this period.` });

  const parts = byDayPart(inWindow).filter((p) => p.sessions >= 3 && p.wpm !== null);
  if (parts.length >= 2) {
    const sorted = [...parts].sort((a, b) => (b.wpm ?? 0) - (a.wpm ?? 0));
    const best = sorted[0]!;
    const worst = sorted[sorted.length - 1]!;
    const p = pct(best.wpm!, worst.wpm!);
    if (p >= 3) out.push({ tone: 'neutral', text: `You type fastest in the ${best.part} (${r1(best.wpm!)} WPM), ${r1(p)}% faster than in the ${worst.part}.` });
  }

  const daysSince = all.length ? Math.floor((now - Math.max(...all.map((s) => s.startedAt))) / DAY) : null;
  if (daysSince !== null && daysSince >= 3) out.push({ tone: 'bad', text: `Your last test was ${daysSince} days ago. Short daily sessions beat occasional long ones.` });

  const restarted = inWindow.filter((s) => !s.completed).length;
  if (inWindow.length >= 10 && restarted / inWindow.length >= 0.3)
    out.push({ tone: 'neutral', text: `You restarted ${Math.round((restarted / inWindow.length) * 100)}% of your tests. Finishing them gives TypeLens more to analyse.` });

  return out;
}
