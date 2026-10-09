import { describe, expect, it } from 'vitest';
import { buildBursts, buildReplay, buildTestChart, typedStateAt } from '../src/replay';
import { makeSession } from '../src/fixtures';
import type { InputEvent, Session } from '../src/schema';

/** a session from raw input events only (key events are not needed for the text/graph logic) */
function fromEvents(words: string[], inputEvents: InputEvent[]): Session {
  const s = makeSession({ text: words.join(' ') });
  s.inputEvents = inputEvents;
  return s;
}
const ins = (t: number, wi: number, ci: number, typed: string, expected: string): InputEvent => ({ t, op: 'ins', wi, ci, typed, expected, correct: typed === expected });

describe('typedStateAt', () => {
  it('rebuilds text, word completion and caret at any moment', () => {
    const s = makeSession({ text: 'ab cd' }); // a0 b150 ␣300 c450 d600 ␣750
    const mid = typedStateAt(s.words, s.inputEvents, 460);
    expect(mid.words.map((w) => w.typed)).toEqual(['ab', 'c']);
    expect(mid.words.map((w) => w.completed)).toEqual([true, false]);
    expect([mid.caretWi, mid.caretCi]).toEqual([1, 1]);
    const afterSpace = typedStateAt(s.words, s.inputEvents, 300);
    expect([afterSpace.caretWi, afterSpace.caretCi]).toEqual([1, 0]); // caret moved to the next word
    expect(typedStateAt(s.words, s.inputEvents, -1).words.every((w) => w.typed === '')).toBe(true);
  });

  it('Backspace across a space reopens the previous word WITHOUT deleting its letters', () => {
    const ev = [ins(0, 0, 0, 'a', 'a'), ins(100, 0, 1, 'x', 'b'), { t: 200, op: 'commit', wi: 0, ci: 2 } as InputEvent,
      { t: 300, op: 'del', wi: 0, ci: 2 } as InputEvent, // the space
      { t: 400, op: 'del', wi: 0, ci: 1 } as InputEvent, // the x
      ins(500, 0, 1, 'b', 'b')];
    const st = typedStateAt(['ab', 'cd'], ev, 300);
    expect(st.words[0]).toMatchObject({ typed: 'ax', completed: false });
    expect([st.caretWi, st.caretCi]).toEqual([0, 2]);
    const fixed = typedStateAt(['ab', 'cd'], ev, 500);
    expect(fixed.words[0]!.typed).toBe('ab');
    expect(fixed.words[0]!.perChar.map((c) => c.correct)).toEqual([true, true]);
  });

  it('shows extra characters beyond the word and wdel clears a word', () => {
    const ev = [ins(0, 0, 0, 'a', 'a'), ins(100, 0, 1, 'b', 'b'), ins(200, 0, 2, 'z', '')];
    const st = typedStateAt(['ab'], ev, 200);
    expect(st.words[0]!.perChar).toEqual([
      { typed: 'a', expected: 'a', correct: true },
      { typed: 'b', expected: 'b', correct: true },
      { typed: 'z', expected: '', correct: false },
    ]);
    expect(typedStateAt(['ab'], [...ev, { t: 300, op: 'wdel', wi: 0, ci: 0 }], 300).words[0]!.typed).toBe('');
  });
});

describe('buildTestChart (Monkeytype result graph)', () => {
  it('computes cumulative wpm, per-second raw and errors', () => {
    // 10 x "cat" at 150 ms per key: 40 characters in 5850 ms (+ keyup 90 => 5940 ms)
    const s = makeSession({ text: Array(10).fill('cat').join(' ') });
    const c = buildTestChart(s, 6000);
    expect(c.seconds).toEqual([1, 2, 3, 4, 5, 6]);
    // second 1: keys at 0,150,...,900 = 7 characters => raw 7*12 = 84; nothing wrong
    expect(c.raw[0]).toBe(84);
    expect(c.errors.every((e) => e === 0)).toBe(true);
    // at 6 s everything (40 correct chars) is typed: 40*60/6/5 = 80 wpm
    expect(c.wpm[5]).toBe(80);
    // at 1 s: "cat␣" (4) + "ca" (2, correct prefix of the open word) + ... keys 0..900: c a t ␣ c a t => 7 chars
    expect(c.wpm[0]).toBe(84);
  });

  it('counts a wrong word only in raw, and marks the error in its second', () => {
    const ev = [ins(0, 0, 0, 'x', 'a'), ins(200, 0, 1, 'b', 'b'), { t: 400, op: 'commit', wi: 0, ci: 2 } as InputEvent, ins(600, 1, 0, 'c', 'c'), ins(800, 1, 1, 'd', 'd'), { t: 1500, op: 'commit', wi: 1, ci: 2 } as InputEvent];
    const c = buildTestChart(fromEvents(['ab', 'cd'], ev), 1500);
    expect(c.seconds).toEqual([1, 1.5]);
    expect(c.errors).toEqual([1, 0]);
    expect(c.raw[0]).toBe(60); // 5 chars in the first second
    // at 1 s: "xb" is wrong (0), open word "cd" has correct prefix 2 => 2 chars => 2*60/1/5 = 24
    expect(c.wpm[0]).toBe(24);
    // the partial last second (0.5 s) holds 1 char => 1*60/0.5/5 = 24; wpm at 1.5 s: "cd␣" = 3 chars => 3*60/1.5/5 = 24
    expect(c.raw[1]).toBe(24);
    expect(c.wpm[1]).toBe(24);
  });

  it('drops a sub-100 ms tail and is empty for an empty test', () => {
    expect(buildTestChart(makeSession({ text: 'ab' }), 1050).seconds).toEqual([1]);
    expect(buildTestChart(makeSession({ text: 'ab' }), 0)).toEqual({ seconds: [], wpm: [], raw: [], errors: [] });
  });
});

describe('buildBursts', () => {
  it('times each word from the previous space, counting corrected errors', () => {
    const s = makeSession({ text: 'cat dog', errors: [{ wi: 1, ci: 0, typed: 'f' }] });
    // cat: 0..450 (space) => 4 chars / 0.45 s = 106.7 wpm ; dog: f(600) BS(750) d o g ␣(1350) => 4 / 0.9 s = 53.3
    expect(buildBursts(s)).toEqual([
      { wi: 0, word: 'cat', typed: 'cat', wpm: 106.7, errors: 0, startMs: 0, endMs: 450 },
      { wi: 1, word: 'dog', typed: 'dog', wpm: 53.3, errors: 1, startMs: 450, endMs: 1350 },
    ]);
  });

  it('includes the last word of a words-mode test, which ends on its last letter without a space', () => {
    // "ab cd": ␣ at 300; c(450) d(600) end the test — no final space
    const s = makeSession({ text: 'ab cd' });
    s.inputEvents = s.inputEvents.filter((e) => !(e.op === 'commit' && e.wi === 1));
    const b = buildBursts(s);
    expect(b.map((x) => x.word)).toEqual(['ab', 'cd']);
    // "cd" = 2 chars (no space) over 300..600 ms => 2 * 60 / 0.3 / 5 = 80 wpm
    expect(b[1]).toMatchObject({ typed: 'cd', startMs: 300, endMs: 600, wpm: 80 });
    // a time test cut off mid-word ("c" of "cd") does not count as a finished word
    s.inputEvents = s.inputEvents.filter((e) => !(e.wi === 1 && e.ci === 1));
    expect(buildBursts(s).map((x) => x.word)).toEqual(['ab']);
  });

  it('re-measures a word that was reopened with Backspace', () => {
    const ev = [ins(0, 0, 0, 'a', 'a'), { t: 200, op: 'commit', wi: 0, ci: 1 } as InputEvent, { t: 300, op: 'del', wi: 0, ci: 1 } as InputEvent, ins(400, 0, 1, 'b', 'b'), { t: 600, op: 'commit', wi: 0, ci: 2 } as InputEvent];
    const b = buildBursts(fromEvents(['ab'], ev));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ typed: 'ab', startMs: 0, endMs: 600 });
  });
});

describe('buildReplay', () => {
  it('computes duration, rolling speed, pauses, the graph and bursts', () => {
    const r = buildReplay(makeSession({ id: 'rp', text: 'ab', pauses: [{ wi: 0, ci: 1, ms: 3000 }], result: { wpm: 1, rawWpm: 1, acc: 100, consistency: 1, testDurationSec: 3.4 } }));
    // a down 0, b down 3150, space down 3300 (up 3390): duration 3390 => 4 seconds
    expect(r.durationMs).toBe(3390);
    expect(r.wpmPerSecond).toEqual([12, 0, 0, 24]);
    expect(r.pauses).toEqual([[0, 3150]]);
    expect(r.chart.seconds).toEqual([1, 2, 3, 3.39]);
    expect(r.bursts).toHaveLength(1);
    expect(r).toMatchObject({ sessionId: 'rp', words: ['ab'], completed: true, flags: [], result: { testDurationSec: 3.4 } });
  });

  it('handles an empty session', () => {
    const s = makeSession({ text: 'ab' });
    s.keyEvents = [];
    s.inputEvents = [];
    expect(buildReplay(s)).toMatchObject({ durationMs: 0, wpmPerSecond: [], pauses: [], bursts: [], chart: { seconds: [] } });
  });
});
