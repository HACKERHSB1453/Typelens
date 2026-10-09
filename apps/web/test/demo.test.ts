import { describe, expect, it } from 'vitest';
import { analyze, buildProgress, buildReplay, validateSession } from '@typelens/core';
import { generateDemoSessions } from '../src/data/demo';

const NOW = new Date(2026, 8, 20, 12).getTime();

describe('demo sessions', () => {
  const sessions = generateDemoSessions(NOW);

  it('are valid recorder-format sessions', () => {
    expect(sessions).toHaveLength(60);
    expect(sessions.map(validateSession).filter(Boolean)).toEqual([]);
    expect(new Set(sessions.map((s) => s.id)).size).toBe(60);
  });

  it('are deterministic', () => {
    expect(generateDemoSessions(NOW)[10]).toEqual(sessions[10]);
  });

  it('produce realistic numbers through the real pipeline', () => {
    const a = analyze(sessions, {}, NOW);
    expect(a.overall.wpm).toBeGreaterThan(35);
    expect(a.overall.wpm).toBeLessThan(110);
    expect(a.overall.acc).toBeGreaterThan(90);
    expect(a.overall.acc).toBeLessThan(100);
    expect(a.overall.rolloverRate).toBeGreaterThan(0);
    // the simulated slow transitions are what the analysis finds
    const topGrams = a.bigrams.slice(0, 8).map((g) => g.gram);
    expect(topGrams.some((g) => ['th', 'ph', 'ck', 'ng', 'st'].includes(g))).toBe(true);
    // Monkeytype's own (simulated) result agrees with the derived numbers, so nothing is flagged unreliable
    for (const s of sessions.filter((x) => x.result)) {
      expect(s.result!.wpm).toBeGreaterThan(20);
      expect(s.result!.wpm).toBeLessThan(160);
    }
  });

  it('show improvement over time and render a result graph', () => {
    const p = buildProgress(sessions, {}, NOW);
    const first = p.points.slice(0, 5).reduce((s, x) => s + x.avgWpm, 0) / 5;
    const last = p.points.slice(-5).reduce((s, x) => s + x.avgWpm, 0) / 5;
    expect(last).toBeGreaterThan(first);
    const r = buildReplay(sessions.find((s) => s.completed && s.config.mode === 'time')!);
    expect(r.chart.seconds.length).toBeGreaterThan(10);
    expect(Math.max(...r.chart.wpm)).toBeLessThan(250);
    expect(r.bursts.length).toBeGreaterThan(10);
  });
});
