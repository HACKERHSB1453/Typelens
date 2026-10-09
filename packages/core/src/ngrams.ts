/**
 * N-gram extraction shared by analyze() and buildProgress().
 *
 * A gram is a run of 2 or 3 consecutive keystrokes with NO delete in between and no pause between
 * them, identified by the EXPECTED characters (what the test wanted), e.g. "th". Within a word by
 * default; with includeSpace it may cross the committing space, which is shown as "␣".
 */
import type { Keystroke } from './schema';
import { labelForChar } from './layout';

export interface GramHit {
  gram: string;
  /** last.t - first.t */
  ms: number;
  /** the LAST keystroke of the gram was wrong */
  error: boolean;
  first: Keystroke;
  last: Keystroke;
}

export function* ngramHits(ks: readonly Keystroke[], n: 2 | 3, includeSpace: boolean): Generator<GramHit> {
  for (let i = n - 1; i < ks.length; i++) {
    const first = ks[i - n + 1] as Keystroke;
    const last = ks[i] as Keystroke;
    let ok = true;
    let gram = '';
    for (let j = i - n + 1; j <= i; j++) {
      const k = ks[j] as Keystroke;
      if (k.expected === '') ok = false; // an extra character typed beyond the word: no target to name
      if (j > i - n + 1 && (k.prev === null || k.ikiMs === null)) ok = false; // a delete or a pause broke the run
      if (!includeSpace && (k.code === 'Space' || k.wi !== first.wi)) ok = false;
      gram += labelForChar(k.expected);
    }
    if (ok) yield { gram, ms: last.t - first.t, error: !last.correct, first, last };
  }
}
