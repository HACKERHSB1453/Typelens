/**
 * Replaying a recorded test: the text state at any moment, Monkeytype's per-second result graph (which
 * Monkeytype itself never stores), and per-word burst speeds.
 */
import type { InputEvent, ReplayData, Session, SpeedPoint, TestChart, TypedState, WordBurst } from './schema';
import { round } from './stats-util';

const PAUSE_MS = 2000;

// ------------------------------------------------------------------ text state

/** Mutable replay of the word box: what has been typed in each word and which words were committed. */
class Tape {
  typed = new Map<number, string>();
  committed = new Set<number>();
  /** the word the caret is in */
  wi = 0;

  apply(e: InputEvent): void {
    const cur = this.typed.get(e.wi) ?? '';
    switch (e.op) {
      case 'ins':
        this.typed.set(e.wi, cur.slice(0, e.ci) + (e.typed ?? ''));
        this.wi = e.wi;
        break;
      case 'del':
        if (this.committed.has(e.wi) && e.ci >= cur.length) {
          this.committed.delete(e.wi); // Backspace across the space: the word is open again, its letters stay
        } else {
          this.typed.set(e.wi, cur.slice(0, Math.min(e.ci, cur.length)));
        }
        this.wi = e.wi;
        break;
      case 'wdel':
        this.typed.set(e.wi, '');
        this.committed.delete(e.wi);
        this.wi = e.wi;
        break;
      case 'commit':
        this.committed.add(e.wi);
        this.wi = e.wi + 1;
        break;
    }
  }

  /** Monkeytype's WPM numerator: chars of correctly committed words + their spaces + the correct prefix of the open word. */
  correctChars(words: readonly string[]): number {
    let n = 0;
    for (const wi of this.committed) {
      const t = this.typed.get(wi) ?? '';
      if (t === (words[wi] ?? '')) n += t.length + 1;
    }
    if (!this.committed.has(this.wi)) {
      const t = this.typed.get(this.wi) ?? '';
      const target = words[this.wi] ?? '';
      let i = 0;
      while (i < t.length && t[i] === target[i]) i++;
      n += i;
    }
    return n;
  }
}

/** The test as it looked at time `t` (ms since the first keystroke). */
export function typedStateAt(words: readonly string[], inputEvents: readonly InputEvent[], t: number): TypedState {
  const tape = new Tape();
  for (const e of inputEvents) {
    if (e.t > t) break;
    tape.apply(e);
  }
  const lastTyped = Math.max(-1, ...tape.typed.keys());
  const count = Math.max(words.length, lastTyped + 1);
  const out: TypedState['words'] = [];
  for (let wi = 0; wi < count; wi++) {
    const expected = words[wi] ?? '';
    const typed = tape.typed.get(wi) ?? '';
    const perChar: TypedState['words'][number]['perChar'] = [];
    for (let i = 0; i < Math.max(typed.length, expected.length); i++) {
      const ty = typed[i] ?? '';
      const ex = expected[i] ?? '';
      perChar.push({ typed: ty, expected: ex, correct: ty !== '' && ty === ex });
    }
    out.push({ expected, typed, completed: tape.committed.has(wi), perChar });
  }
  return { words: out, caretWi: tape.wi, caretCi: (tape.typed.get(tape.wi) ?? '').length };
}

// ------------------------------------------------------------------ result graph

export function buildTestChart(s: Session, durationMs: number): TestChart {
  const chart: TestChart = { seconds: [], wpm: [], raw: [], errors: [] };
  if (durationMs <= 0) return chart;
  const whole = Math.floor(durationMs / 1000);
  const ends: number[] = Array.from({ length: whole }, (_, i) => (i + 1) * 1000);
  if (durationMs - whole * 1000 >= 100) ends.push(durationMs); // keep a partial last second unless it is a sliver

  const tape = new Tape();
  const events = s.inputEvents;
  let k = 0;
  let prevEnd = 0;
  const lastEnd = ends[ends.length - 1] as number;
  for (const end of ends) {
    let typedNow = 0;
    let errors = 0;
    // the final interval is closed so the last event (often the final space, at exactly durationMs) is counted
    while (k < events.length && ((events[k] as InputEvent).t < end || (end === lastEnd && (events[k] as InputEvent).t <= end))) {
      const e = events[k] as InputEvent;
      tape.apply(e);
      if (e.op === 'ins' || e.op === 'commit') typedNow++;
      if (e.op === 'ins' && e.correct === false) errors++;
      k++;
    }
    const secs = (end - prevEnd) / 1000;
    chart.seconds.push(round(end / 1000, 2));
    chart.wpm.push(round((tape.correctChars(s.words) * 60) / (end / 1000) / 5, 2));
    chart.raw.push(round((typedNow * 60) / secs / 5, 2));
    chart.errors.push(errors);
    prevEnd = end;
  }
  return chart;
}

/**
 * The graph's numbers at any moment `t` (ms since the first keystroke), computed the same way as buildTestChart
 * but not limited to whole seconds. Raw speed uses the second before `t` as its window.
 */
export function speedAt(words: readonly string[], inputEvents: readonly InputEvent[], t: number): SpeedPoint {
  const tape = new Tape();
  const window = Math.min(1000, t);
  let typedInWindow = 0;
  let errors = 0;
  for (const e of inputEvents) {
    if (e.t > t) break;
    tape.apply(e);
    if (e.op === 'ins' && e.correct === false) errors++;
    if ((e.op === 'ins' || e.op === 'commit') && e.t >= t - window) typedInWindow++;
  }
  const secs = t / 1000;
  return {
    t,
    wpm: secs > 0 ? round((tape.correctChars(words) * 60) / secs / 5, 2) : 0,
    raw: window > 0 ? round((typedInWindow * 60) / (window / 1000) / 5, 2) : 0,
    errors,
  };
}

export function buildBursts(s: Session): WordBurst[] {
  const out: WordBurst[] = [];
  const typed = new Map<number, string>();
  const errors = new Map<number, number>();
  let wordStart: number | null = null;
  for (const e of s.inputEvents) {
    const cur = typed.get(e.wi) ?? '';
    if (e.op === 'ins') {
      if (wordStart === null) wordStart = e.t;
      typed.set(e.wi, cur.slice(0, e.ci) + (e.typed ?? ''));
      if (e.correct === false) errors.set(e.wi, (errors.get(e.wi) ?? 0) + 1);
    } else if (e.op === 'del') {
      if (e.ci < cur.length) typed.set(e.wi, cur.slice(0, e.ci));
      else {
        const i = out.findIndex((b) => b.wi === e.wi); // un-committed: its burst is measured again when re-committed
        if (i >= 0) {
          wordStart = (out[i] as WordBurst).startMs;
          out.splice(i, 1);
        }
      }
    } else if (e.op === 'wdel') {
      typed.set(e.wi, '');
    } else if (e.op === 'commit') {
      const t = typed.get(e.wi) ?? '';
      const start = wordStart ?? e.t;
      const ms = e.t - start;
      if (t.length > 0) {
        out.push({
          wi: e.wi,
          word: s.words[e.wi] ?? '',
          typed: t,
          wpm: ms > 0 ? round(((t.length + 1) * 60) / (ms / 1000) / 5, 1) : 0,
          errors: errors.get(e.wi) ?? 0,
          startMs: start,
          endMs: e.t,
        });
      }
      wordStart = e.t; // the next word's clock starts at this space, like Monkeytype's burst
    }
  }
  // The final word of a words/quote test ends the test on its last letter, without a space: measure it to its
  // last keystroke. (A time-mode test cut off mid-word is left out: that word was never finished.)
  const lastIns = [...s.inputEvents].reverse().find((e) => e.op === 'ins');
  if (lastIns && !out.some((b) => b.wi === lastIns.wi)) {
    const t = typed.get(lastIns.wi) ?? '';
    const word = s.words[lastIns.wi] ?? '';
    const start = wordStart ?? lastIns.t;
    const ms = lastIns.t - start;
    if (t.length >= word.length && word.length > 0 && ms > 0) {
      out.push({ wi: lastIns.wi, word, typed: t, wpm: round((t.length * 60) / (ms / 1000) / 5, 1), errors: errors.get(lastIns.wi) ?? 0, startMs: start, endMs: lastIns.t });
    }
  }
  return out.sort((a, b) => a.endMs - b.endMs);
}

// ------------------------------------------------------------------ entry point

export function buildReplay(s: Session): ReplayData {
  const lastKey = s.keyEvents.reduce((m, e) => Math.max(m, e.t), 0);
  const lastInput = s.inputEvents.reduce((m, e) => Math.max(m, e.t), 0);
  const durationMs = Math.max(lastKey, lastInput);

  // Correct characters (and word-committing spaces) typed in each second, as WPM (5 chars = 1 word).
  const seconds = durationMs > 0 ? Math.ceil(durationMs / 1000) : 0;
  const counts = new Array<number>(seconds).fill(0);
  for (const e of s.inputEvents) {
    if (e.op === 'commit' || (e.op === 'ins' && e.correct)) {
      const i = Math.min(seconds - 1, Math.floor(e.t / 1000));
      if (i >= 0) counts[i] = (counts[i] as number) + 1;
    }
  }
  const wpmPerSecond = counts.map((c) => (c * 60) / 5);

  const downs = s.keyEvents.filter((e) => e.type === 'down');
  const pauses: Array<[number, number]> = [];
  for (let i = 1; i < downs.length; i++) {
    const a = (downs[i - 1] as { t: number }).t;
    const b = (downs[i] as { t: number }).t;
    if (b - a > PAUSE_MS) pauses.push([a, b]);
  }

  const replay: ReplayData = {
    sessionId: s.id,
    config: s.config,
    words: s.words,
    durationMs,
    keyEvents: s.keyEvents,
    inputEvents: s.inputEvents,
    wpmPerSecond,
    pauses,
    chart: buildTestChart(s, durationMs),
    bursts: buildBursts(s),
    startedAt: s.startedAt,
    completed: s.completed,
    flags: s.flags,
  };
  if (s.result) replay.result = s.result;
  return replay;
}
