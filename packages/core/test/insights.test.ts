import { describe, expect, it } from 'vitest';
import type { SessionSummary } from '../src/schema';
import {
  buildInsights,
  byDayPart,
  comparePeriods,
  goalProgress,
  periodStats,
  personalBestIds,
  personalBests,
  sanitizeGoals,
  startOfWeek,
} from '../src/insights';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 29, 15, 0, 0).getTime(); // Thursday 15:00 local

function sum(id: string, startedAt: number, o: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    startedAt,
    config: { mode: 'time', mode2: '30', language: 'english', punctuation: false, numbers: false, funbox: [] },
    wpm: 60,
    rawWpm: 62,
    acc: 96,
    consistency: 70,
    durationSec: 30,
    keystrokes: 150,
    completed: true,
    flags: [],
    ...o,
  };
}

describe('periodStats', () => {
  it('weights averages by duration and ignores unfinished or unreliable tests', () => {
    const st = periodStats([
      sum('a', 1, { wpm: 60, durationSec: 30 }),
      sum('b', 2, { wpm: 90, durationSec: 60 }),
      sum('c', 3, { wpm: 200, completed: false }),
      sum('d', 4, { wpm: 200, flags: ['captureUnreliable'] }),
    ]);
    expect(st.sessions).toBe(4);
    expect(st.minutes).toBeCloseTo(2.5);
    expect(st.wpm).toBeCloseTo(80);
  });
  it('has no averages without countable tests', () => {
    expect(periodStats([]).wpm).toBeNull();
  });
});

describe('comparePeriods', () => {
  it('compares a window with the one of equal length before it', () => {
    const all = [sum('old', NOW - 10 * DAY, { wpm: 50 }), sum('new', NOW - 2 * DAY, { wpm: 70 }), sum('ancient', NOW - 40 * DAY, { wpm: 10 })];
    const c = comparePeriods(all, NOW - 7 * DAY, NOW);
    expect(c.current.sessions).toBe(1);
    expect(c.previous.sessions).toBe(1);
    expect(c.delta.wpm).toBeCloseTo(20);
  });
});

describe('personal bests', () => {
  const all = [
    sum('a', 1, { wpm: 60 }),
    sum('b', 2, { wpm: 70 }),
    sum('c', 3, { wpm: 65 }),
    sum('d', 4, { wpm: 99, config: { mode: 'words', mode2: '50', language: 'english', punctuation: false, numbers: false, funbox: [] } }),
    sum('e', 5, { wpm: 120, completed: false }),
  ];
  it('keeps the fastest countable test per mode, most played first', () => {
    const pbs = personalBests(all);
    expect(pbs.map((p) => [p.key, p.best.id, p.tests])).toEqual([
      ['time 30', 'b', 3],
      ['words 50', 'd', 1],
    ]);
  });
  it('marks the tests that beat the previous best, not the first of a mode', () => {
    expect([...personalBestIds(all)]).toEqual(['b']);
  });
});

describe('goals', () => {
  it('sanitizes stored values', () => {
    expect(sanitizeGoals(null)).toEqual({ weeklyMinutes: 60, targetWpm: 0 });
    expect(sanitizeGoals({ weeklyMinutes: -5, targetWpm: 99.6 })).toEqual({ weeklyMinutes: 0, targetWpm: 100 });
  });
  it('counts minutes since Monday and the last 7 days of speed', () => {
    const monday = startOfWeek(NOW);
    expect(new Date(monday).getDay()).toBe(1);
    const all = [
      sum('a', monday + DAY, { durationSec: 600, wpm: 80 }),
      sum('b', monday - DAY, { durationSec: 600, wpm: 40 }), // last week: speed only
    ];
    const g = goalProgress(all, { weeklyMinutes: 20, targetWpm: 120 }, NOW);
    expect(g.weekMinutes).toBeCloseTo(10);
    expect(g.weekRatio).toBeCloseTo(0.5);
    expect(g.recentWpm).toBeCloseTo(60);
    expect(g.wpmRatio).toBeCloseTo(0.5);
  });
});

describe('insights', () => {
  it('reports speed changes, new bests and the best time of day', () => {
    const at = (daysAgo: number, hour: number): number => {
      const d = new Date(NOW - daysAgo * DAY);
      d.setHours(hour, 0, 0, 0);
      return d.getTime();
    };
    const all: SessionSummary[] = [];
    for (let i = 0; i < 4; i++) all.push(sum(`p${i}`, at(10 + i, 9), { wpm: 50 }));
    for (let i = 0; i < 4; i++) all.push(sum(`m${i}`, at(1 + i, 9), { wpm: 70 + i }));
    for (let i = 0; i < 4; i++) all.push(sum(`e${i}`, at(1 + i, 20), { wpm: 60 }));
    const texts = buildInsights(all, NOW - 7 * DAY, NOW, NOW).map((x) => x.text);
    expect(texts.some((t) => t.startsWith('Your speed is up'))).toBe(true);
    expect(texts.some((t) => t.includes('new personal best'))).toBe(true);
    expect(texts.some((t) => t.includes('fastest in the morning'))).toBe(true);
    expect(byDayPart(all).find((p) => p.part === 'evening')?.sessions).toBe(4);
  });
  it('nudges after a break and says little with little data', () => {
    expect(buildInsights([sum('a', NOW - 5 * DAY)], NOW - 7 * DAY, NOW, NOW).map((i) => i.tone)).toEqual(['bad']);
    expect(buildInsights([], NOW - 7 * DAY, NOW, NOW)).toEqual([]);
  });
});
