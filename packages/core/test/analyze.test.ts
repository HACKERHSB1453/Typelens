import { describe, expect, it } from 'vitest';
import { analyze, committedWords, selectSessions, sessionStats } from '../src/analyze';
import { deriveKeystrokes } from '../src/derive';
import { makeSession, repeatWords } from '../src/fixtures';
import { consistency } from '../src/monkeytype';
import { buildProgress, streaks } from '../src/progress';

/** five sessions of "the ah the ah ..." where 'h' after 't' is slow (250 ms) but 'h' after 'a' is fast (150 ms) */
function slowThSessions(n = 5) {
  return Array.from({ length: n }, (_, i) =>
    makeSession({
      id: `s${i}`,
      startedAt: 1_700_000_000_000 + i * 60_000,
      text: 'the ah the ah the ah',
      pauses: [0, 2, 4].map((wi) => ({ wi, ci: 1, ms: 100 })),
    }),
  );
}

describe('analyze: n-grams', () => {
  it('finds the transition that is slower than its keys predict', () => {
    // 5 sessions x 3 "the" and 3 "ah".
    // 'h' keystrokes: 15 after 't' at 250 ms and 15 after 'a' at 150 ms => baseline (median) = 200.
    // th: median 250, expected 200 => cost +50.  ah: median 150, expected 200 => -50.
    // he: e always follows h at 150 ms, baseline(e) = 150 => 0.
    const a = analyze(slowThSessions());
    expect(a.bigrams.map((g) => g.gram)).toEqual(['th', 'he', 'ah']);
    expect(a.bigrams[0]).toMatchObject({ gram: 'th', n: 2, count: 15, medianMs: 250, expectedMs: 200, costMs: 50, errorRate: 0 });
    expect(a.bigrams[1]).toMatchObject({ gram: 'he', medianMs: 150, expectedMs: 150, costMs: 0 });
    expect(a.bigrams[2]).toMatchObject({ gram: 'ah', medianMs: 150, expectedMs: 200, costMs: -50 });
    // trigram "the": t->e = 250 + 150 = 400 ms; expected = base(h) 200 + base(e) 150 = 350 => +50
    expect(a.trigrams).toEqual([expect.objectContaining({ gram: 'the', n: 3, count: 15, medianMs: 400, expectedMs: 350, costMs: 50 })]);
  });

  it('respects minSamples and excludes grams broken by a delete or a pause', () => {
    const sessions = slowThSessions(1); // 3 occurrences each: below the default of 5
    expect(analyze(sessions).bigrams).toEqual([]);
    expect(analyze(sessions, { minSamples: 3 }).bigrams.map((g) => g.gram)).toContain('th');
    // c, s(wrong, meant 'a'), Backspace, a, t. Grams are named by what the test WANTED:
    //  - the wrong keypress is still an attempt at "ca" (6 attempts, all wrong)
    //  - the retried 'a' follows a delete, so it does not form a second "ca"
    //  - a->t is a clean transition
    const broken = Array.from({ length: 6 }, (_, i) => makeSession({ id: `b${i}`, text: 'cat', errors: [{ wi: 0, ci: 1, typed: 's' }] }));
    const bigrams = analyze(broken).bigrams;
    expect(bigrams.find((g) => g.gram === 'ca')).toMatchObject({ count: 6, errorRate: 1 });
    expect(bigrams.find((g) => g.gram === 'at')).toMatchObject({ count: 6, errorRate: 0 });
  });

  it('only crosses word boundaries when includeSpaceNgrams is set, showing space as ␣', () => {
    const sessions = Array.from({ length: 6 }, (_, i) => makeSession({ id: `w${i}`, text: 'go on' }));
    expect(analyze(sessions).bigrams.map((g) => g.gram).sort()).toEqual(['go', 'on']);
    const withSpace = analyze(sessions, { includeSpaceNgrams: true }).bigrams.map((g) => g.gram).sort();
    expect(withSpace).toEqual(expect.arrayContaining(['o␣', '␣o', 'go', 'on', 'n␣']));
  });
});

describe('analyze: keys, confusions, words', () => {
  const erroneous = Array.from({ length: 5 }, (_, i) => makeSession({ id: `e${i}`, text: 'cat dog', errors: [{ wi: 0, ci: 1, typed: 's' }] }));

  it('computes per-key counts, error rates, timings and what was typed instead', () => {
    const a = analyze(erroneous);
    // 's' was pressed 5 times, but only ever by mistake: it is never the key the test asked for,
    // so it must not show up as a key with a 100% error rate
    expect(a.keys.find((k) => k.code === 'KeyS')).toBeUndefined();
    // 'a' was asked for 10 times: 5 misses (typed 's'), then 5 corrected hits
    const keyA = a.keys.find((k) => k.code === 'KeyA')!;
    expect(keyA).toMatchObject({ count: 10, errorRate: 0.5, char: 'a', finger: 'LP', hand: 'L', row: 'home' });
    expect(keyA.confusions).toEqual([{ typed: 's', count: 5 }]); // "typed s instead of a", five times
    expect(keyA.medianHoldMs).toBe(90); // timings come from the correct presses of 'a'
    expect(a.keys.find((k) => k.code === 'Space')).toMatchObject({ char: '␣', finger: 'RT', count: 10 });
    expect(a.keys[0]!.count).toBeGreaterThanOrEqual(a.keys[1]!.count); // sorted by count
    expect(a.keys.find((k) => k.code === 'KeyT')!.medianHoldMs).toBe(90);
  });

  it('computes word statistics: error rate, corrected rate and burst speed', () => {
    const a = analyze(erroneous);
    // "cat": c(0) s(150) BS(300) a(450) t(600) ␣(750) => elapsed 750 ms => (3+1)*60/0.75/5 = 64 WPM
    // "dog": next word, elapsed = 1350 - 750 = 600 ms => 4*60/0.6/5 = 80 WPM
    expect(a.words.map((w) => w.word)).toEqual(['cat', 'dog']); // most error-prone first
    expect(a.words[0]).toMatchObject({ word: 'cat', count: 5, errorRate: 1, correctedRate: 1, medianWpm: 64 });
    expect(a.words[1]).toMatchObject({ word: 'dog', count: 5, errorRate: 0, correctedRate: 0, medianWpm: 80 });
  });

  it('uncorrected errors count as errors but not as corrected', () => {
    const sessions = Array.from({ length: 5 }, (_, i) => {
      const s = makeSession({ id: `u${i}`, text: 'cat' });
      const ins = s.inputEvents.find((e) => e.op === 'ins' && e.ci === 1)!;
      ins.typed = 'x';
      ins.correct = false;
      return s;
    });
    expect(analyze(sessions).words[0]).toMatchObject({ word: 'cat', errorRate: 1, correctedRate: 0 });
  });
});

describe('analyze: fingers, hands, rows, rollover, alternation', () => {
  it('groups by finger/hand/row and measures rollover and hand alternation', () => {
    // "asdf" on the left hand only, rolling over; "jk" hands alternate with nothing
    const sessions = Array.from({ length: 5 }, (_, i) => makeSession({ id: `r${i}`, text: 'as fj', rollover: true }));
    const a = analyze(sessions);
    const lp = a.fingers.find((f) => f.finger === 'LP')!;
    expect(lp.count).toBe(5); // 'a' once per session
    expect(a.fingers.map((f) => f.finger)).toEqual(['LP', 'LR', 'LI', 'RT', 'RI']); // canonical order, only used fingers
    // every keystroke after the first per session rolls over (flight = -40)
    const total = a.keystrokes;
    expect(total).toBe(5 * 6); // a s ␣ f j ␣
    expect(a.overall.rolloverRate).toBeCloseTo((5 * 5) / total, 3);
    expect(a.hands.map((h) => h.hand)).toEqual(['L', 'R']);
    expect(a.rows.map((r) => r.row)).toEqual(['home', 'space']);
    // in-word pairs: a->s (same hand), f->j (different hands)
    expect(a.handAlternation).toEqual({ alternatingMedianMs: 150, sameHandMedianMs: 150 });
  });

  it('counts same-finger bigrams (different keys, same finger)', () => {
    // f->g are both left index; "fg" is a same-finger bigram
    const sessions = Array.from({ length: 5 }, (_, i) => makeSession({ id: `f${i}`, text: 'fg' }));
    expect(analyze(sessions).sameFingerBigram).toEqual({ count: 5, medianMs: 150, errorRate: 0 });
  });
});

describe('analyze: overall statistics', () => {
  it('matches Monkeytype formulas on a clean session', () => {
    // 10 words "cat": 30 letters + 10 spaces = 40 chars in 6 s => 40 * 60 / 6 / 5 = 80 WPM, 100% accuracy
    const s = makeSession({ text: repeatWords('cat', 10), result: { wpm: 80, rawWpm: 80, acc: 100, consistency: 90, testDurationSec: 6 } });
    const ks = deriveKeystrokes(s);
    expect(ks).toHaveLength(40);
    const st = sessionStats(s, ks);
    expect(st.wpm).toBe(80);
    expect(st.rawWpm).toBe(80);
    expect(st.acc).toBe(100);
    // keystrokes per second at 150 ms spacing: [7,7,6,7,7,6] => raw WPM per second = x12
    expect(st.consistency).toBeCloseTo(consistency([84, 84, 72, 84, 84, 72]), 6);
    const a = analyze([s]);
    expect(a.overall).toMatchObject({ wpm: 80, rawWpm: 80, acc: 100, medianIkiMs: 150, medianHoldMs: 90, rolloverRate: 0, pauseRate: 0 });
    expect(a.sessions).toBe(1);
    expect(a.keystrokes).toBe(40);
    expect(a.minutes).toBe(0.1);
  });

  it('words mode: counts the last word, which ends the test without a space, and times to the last keystroke', () => {
    // "ab cd": a(0) b(150) ␣(300) c(450) d(600) — the test ends on "d" (no space); keyup of d is at 690
    const s = makeSession({ text: 'ab cd' });
    s.inputEvents = s.inputEvents.filter((e) => !(e.op === 'commit' && e.wi === 1));
    s.keyEvents = s.keyEvents.filter((e) => e.t <= 690);
    const st = sessionStats(s, deriveKeystrokes(s));
    expect(st.seconds).toBe(0.6); // last keystroke, not the keyup at 0.69
    // "ab" + space + "cd" = 5 correct characters in 0.6 s => 5 * 60 / 0.6 / 5 = 100 wpm (Monkeytype's figure)
    expect(st.wpm).toBe(100);
    expect(st.rawWpm).toBe(100);
    // a wrong open word earns nothing: "cx"
    s.inputEvents.find((e) => e.op === 'ins' && e.wi === 1 && e.ci === 1)!.typed = 'x';
    expect(sessionStats(s, deriveKeystrokes(s)).wpm).toBe(60); // only "ab␣" = 3 chars
  });

  it('a word typed wrongly earns no WPM but still counts towards raw speed and accuracy', () => {
    const s = makeSession({ text: 'cat dog', result: { wpm: 0, rawWpm: 0, acc: 0, consistency: 0, testDurationSec: 2 } });
    s.inputEvents.find((e) => e.op === 'ins' && e.wi === 0 && e.ci === 1)!.typed = 'x'; // "cxt" committed
    const st = sessionStats(s, deriveKeystrokes(s));
    // committed: "cxt" (wrong), "dog" (right): correct chars 3 + 1 space = 4 => 4*60/2/5 = 24 WPM
    expect(st.wpm).toBe(24);
    // raw: typed 3 + 3 letters + 2 spaces = 8 => 8*60/2/5 = 48
    expect(st.rawWpm).toBe(48);
  });

  it('pauses are excluded from timings and reported as pauseRate', () => {
    const s = makeSession({ text: 'abcd', pauses: [{ wi: 0, ci: 2, ms: 3000 }] });
    const a = analyze([s], { minSamples: 1 });
    // 5 keystrokes -> 4 intervals, one of them a pause
    expect(a.overall.pauseRate).toBe(0.25);
    expect(a.overall.medianIkiMs).toBe(150);
    expect(a.ikiHistogram.counts.reduce((x, y) => x + y, 0)).toBe(3); // the pause interval is not in the histogram
  });

  it('returns a well-formed empty analysis', () => {
    const a = analyze([]);
    expect(a).toMatchObject({ sessions: 0, keystrokes: 0, minutes: 0, keys: [], bigrams: [], words: [], range: { from: 0, to: 0 } });
    expect(a.overall).toMatchObject({ wpm: 0, rawWpm: 0, acc: 0, consistency: 0, pauseRate: 0 }); // no data: zeros, never NaN
    expect(a.ikiHistogram.counts).toHaveLength(50);
  });
});

describe('selectSessions / filters', () => {
  const base = 1_700_000_000_000;
  const all = [
    makeSession({ id: 'a', startedAt: base, text: 'x', config: { mode: 'time', language: 'english' } }),
    makeSession({ id: 'b', startedAt: base + 1000, text: 'x', config: { mode: 'words', language: 'english' } }),
    makeSession({ id: 'c', startedAt: base + 2000, text: 'x', config: { mode: 'time', language: 'german' } }),
    makeSession({ id: 'd', startedAt: base + 3000, text: 'x', flags: ['ime'], practice: { focus: ['th'], generatedAt: 1 } }),
    makeSession({ id: 'e', startedAt: base + 4000, text: 'x', flags: ['captureUnreliable'] }),
  ];
  const ids = (f = {}) => selectSessions(all, f).map((s) => s.id);

  it('filters by date, mode, language, practice and flags', () => {
    expect(ids()).toEqual(['a', 'b', 'c']); // flagged sessions are excluded by default
    expect(ids({ excludeFlagged: false })).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids({ from: base + 1000, to: base + 2000 })).toEqual(['b', 'c']);
    expect(ids({ modes: ['words'] })).toEqual(['b']);
    expect(ids({ languages: ['german'] })).toEqual(['c']);
    expect(ids({ practiceOnly: true, excludeFlagged: false })).toEqual(['d']);
  });
});

describe('committedWords', () => {
  it('replays edits, including going back across a committed space', () => {
    const s = makeSession({ text: 'ab cd' });
    // pretend the user pressed Backspace across the first word's space, then re-committed it
    const commitIdx = s.inputEvents.findIndex((e) => e.op === 'commit');
    s.inputEvents.splice(commitIdx + 1, 0, { t: 500, op: 'del', wi: 0, ci: 2 }, { t: 600, op: 'commit', wi: 0, ci: 2 });
    expect(committedWords(s).get(0)).toBe('ab');
    const s2 = makeSession({ text: 'ab cd' });
    s2.inputEvents.splice(s2.inputEvents.findIndex((e) => e.op === 'commit') + 1, 0, { t: 500, op: 'del', wi: 0, ci: 2 });
    expect(committedWords(s2).has(0)).toBe(false); // un-committed and not re-committed
    expect(committedWords(s2).get(1)).toBe('cd');
  });
});

describe('buildProgress', () => {
  const at = (day: number) => new Date(2026, 8, day, 12, 0, 0).getTime(); // local time, September 2026
  const now = at(20);

  it('groups by local day with duration-weighted averages', () => {
    const r = (wpm: number, sec: number) => ({ wpm, rawWpm: wpm, acc: 90 + (wpm % 10), consistency: 80, testDurationSec: sec });
    const sessions = [
      makeSession({ id: 'p1', startedAt: at(18), text: 'ab', result: r(60, 10) }),
      makeSession({ id: 'p2', startedAt: at(18) + 3_600_000, text: 'ab', result: r(90, 30) }),
      makeSession({ id: 'p3', startedAt: at(19), text: 'ab', result: r(70, 60) }),
    ];
    const p = buildProgress(sessions, {}, now);
    expect(p.points.map((x) => x.date)).toEqual(['2026-09-18', '2026-09-19']);
    // day 18: (60*10 + 90*30) / 40 = 82.5 ; minutes = 40/60
    expect(p.points[0]).toMatchObject({ sessions: 2, avgWpm: 82.5, minutes: 0.67 });
    expect(p.points[1]).toMatchObject({ sessions: 1, avgWpm: 70, minutes: 1 });
  });

  it('computes current and longest streaks', () => {
    expect(streaks(['2026-09-18', '2026-09-19', '2026-09-20'], '2026-09-20')).toEqual({ current: 3, longest: 3 });
    expect(streaks(['2026-09-18', '2026-09-19'], '2026-09-20')).toEqual({ current: 2, longest: 2 }); // today not yet typed: still alive
    expect(streaks(['2026-09-17', '2026-09-19'], '2026-09-20')).toEqual({ current: 1, longest: 1 });
    expect(streaks(['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-19'], '2026-09-20')).toEqual({ current: 1, longest: 3 });
    expect(streaks(['2026-09-01'], '2026-09-20')).toEqual({ current: 0, longest: 1 }); // broken
    expect(streaks([], '2026-09-20')).toEqual({ current: 0, longest: 0 });
    expect(streaks(['2026-02-28', '2026-03-01'], '2026-03-01')).toEqual({ current: 2, longest: 2 }); // month boundary
  });

  it('reports which bigrams improved and which regressed between the earliest and latest third', () => {
    const mk = (day: number, early: boolean) =>
      makeSession({
        id: `t${day}`,
        startedAt: at(day),
        text: 'the ah the ah',
        // early: 'h' after 't' is slow; late: 'h' after 'a' is slow
        pauses: (early ? [0, 2] : [1, 3]).map((wi) => ({ wi, ci: 1, ms: 100 })),
      });
    const sessions = [1, 2, 3].map((d) => mk(d, true)).concat([4, 5, 6].map((d) => mk(d, false)).map((s) => ({ ...s, startedAt: s.startedAt })), [7, 8, 9].map((d) => mk(d, false)));
    const p = buildProgress(sessions, {}, now);
    // th: early 250 ms -> late 150 ms (-100, improved);  ah: early 150 -> late 250 (+100, regressed)
    expect(p.improved).toEqual([expect.objectContaining({ gram: 'th', firstMs: 250, lastMs: 150, deltaMs: -100 })]);
    expect(p.regressed).toEqual([expect.objectContaining({ gram: 'ah', firstMs: 150, lastMs: 250, deltaMs: 100 })]);
  });

  it('is empty-safe', () => {
    expect(buildProgress([], {}, now)).toEqual({ points: [], currentStreakDays: 0, longestStreakDays: 0, improved: [], regressed: [] });
  });
});
