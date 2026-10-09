/**
 * Deterministic synthetic sessions for tests (and demos). The emitted keyEvents/inputEvents are consistent,
 * so the result of deriveKeystrokes() is predictable.
 */
import type { InputEvent, KeyEvent, Session, SessionConfig } from './schema';
import { codeForChar } from './layout';

export interface FixtureOptions {
  /** words separated by single spaces; every word is committed with a space, including the last */
  text: string;
  /** time between consecutive keydowns (default 150) */
  msPerKey?: number;
  /** keydown -> keyup (default 90) */
  holdMs?: number;
  /** type a wrong character at (word, char) first, then Backspace, then the right one */
  errors?: Array<{ wi: number; ci: number; typed: string }>;
  /** make every key go down before the previous one is released (overlap = 40 ms) */
  rollover?: boolean;
  /** extra pause (ms) inserted before the keystroke at (word, char) */
  pauses?: Array<{ wi: number; ci: number; ms: number }>;
  startedAt?: number;
  id?: string;
  config?: Partial<SessionConfig>;
  words?: string[];
  flags?: Session['flags'];
  practice?: Session['practice'];
  result?: Session['result'];
  completed?: boolean;
}

export const FIXTURE_START = 1_700_000_000_000;

export function makeSession(o: FixtureOptions): Session {
  const step = o.msPerKey ?? 150;
  const hold = o.rollover ? step + 40 : (o.holdMs ?? 90);
  const words = o.words ?? o.text.split(' ');
  const keyEvents: KeyEvent[] = [];
  const inputEvents: InputEvent[] = [];
  let t = 0;

  const key = (ch: string): { code: string; key: string } => ({ code: codeForChar(ch) ?? 'KeyX', key: ch });
  const press = (code: string, keyName: string): number => {
    const at = t;
    keyEvents.push({ t: at, type: 'down', code, key: keyName });
    keyEvents.push({ t: at + hold, type: 'up', code, key: keyName });
    t += step;
    return at;
  };

  words.forEach((word, wi) => {
    for (let ci = 0; ci < word.length; ci++) {
      const pause = o.pauses?.find((p) => p.wi === wi && p.ci === ci);
      if (pause) t += pause.ms;
      const err = o.errors?.find((e) => e.wi === wi && e.ci === ci);
      if (err) {
        const k = key(err.typed);
        const at = press(k.code, k.key);
        inputEvents.push({ t: at, op: 'ins', wi, ci, typed: err.typed, expected: word[ci] as string, correct: false, code: k.code });
        const bs = press('Backspace', 'Backspace');
        inputEvents.push({ t: bs, op: 'del', wi, ci, code: 'Backspace' });
      }
      const ch = word[ci] as string;
      const k = key(ch);
      const at = press(k.code, k.key);
      inputEvents.push({ t: at, op: 'ins', wi, ci, typed: ch, expected: ch, correct: true, code: k.code });
    }
    const at = press('Space', ' ');
    inputEvents.push({ t: at, op: 'commit', wi, ci: word.length, code: 'Space' });
  });

  const s: Session = {
    v: 1,
    id: o.id ?? 'fixture',
    startedAt: o.startedAt ?? FIXTURE_START,
    source: 'monkeytype',
    config: { mode: 'time', mode2: '30', language: 'english', punctuation: false, numbers: false, funbox: [], ...o.config },
    words,
    keyEvents,
    inputEvents,
    completed: o.completed ?? true,
    flags: o.flags ?? [],
    client: { extVersion: 'fixture' },
  };
  if (o.practice) s.practice = o.practice;
  if (o.result) s.result = o.result;
  return s;
}

/** Repeats a text pattern to n words. */
export function repeatWords(pattern: string, n: number): string {
  const w = pattern.split(' ');
  return Array.from({ length: n }, (_, i) => w[i % w.length]).join(' ');
}
