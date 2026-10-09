/**
 * Raw capture -> one Keystroke per typed character (and one per word-committing space).
 *
 * Timing definitions (all ms):
 *   ikiMs    = this keydown - previous keystroke's keydown (null for the first keystroke, or when the gap
 *              exceeds pauseMs: that is a hesitation, not a transition)
 *   holdMs   = keyup - keydown of this key
 *   flightMs = this keydown - previous keystroke's keyup; NEGATIVE = rollover (this key went down before
 *              the previous one was released)
 */
import type { Keystroke, KeyEvent, Session } from './schema';
import { codeForChar, keyInfo } from './layout';

export interface DeriveOptions {
  /** gaps longer than this are pauses (default 2000 ms) */
  pauseMs?: number;
}

interface DownRec {
  t: number;
  upT: number | null;
}

const MATCH_TOLERANCE_MS = 0.5;

/** Pairs every keydown with its keyup (FIFO per key code). */
function indexKeyEvents(events: readonly KeyEvent[]): Map<string, DownRec[]> {
  const byCode = new Map<string, DownRec[]>();
  const open = new Map<string, DownRec[]>();
  for (const e of events) {
    if (e.type === 'down') {
      const rec: DownRec = { t: e.t, upT: null };
      (byCode.get(e.code) ?? byCode.set(e.code, []).get(e.code)!).push(rec);
      (open.get(e.code) ?? open.set(e.code, []).get(e.code)!).push(rec);
    } else {
      const q = open.get(e.code);
      const rec = q?.shift();
      if (rec) rec.upT = e.t;
    }
  }
  return byCode;
}

function findDown(byCode: Map<string, DownRec[]>, code: string, t: number): DownRec | null {
  const list = byCode.get(code);
  if (!list) return null;
  for (const rec of list) {
    if (Math.abs(rec.t - t) <= MATCH_TOLERANCE_MS) return rec;
  }
  return null;
}

export function deriveKeystrokes(session: Session, opts: DeriveOptions = {}): Keystroke[] {
  if (session.flags.includes('ime')) return [];
  const pauseMs = opts.pauseMs ?? 2000;
  const downs = indexKeyEvents(session.keyEvents);

  const out: Keystroke[] = [];
  /** the latest wrong, not-yet-corrected keystroke at each (word, char) position */
  const pendingWrong = new Map<string, Keystroke>();
  let prevKs: Keystroke | null = null;
  let prevRec: DownRec | null = null;
  let chainBroken = false;

  for (const ev of session.inputEvents) {
    if (ev.op === 'del') {
      const wrong = pendingWrong.get(`${ev.wi}:${ev.ci}`);
      if (wrong) {
        wrong.corrected = true;
        pendingWrong.delete(`${ev.wi}:${ev.ci}`);
      }
      chainBroken = true;
      continue;
    }
    if (ev.op === 'wdel') {
      for (const [k, ks] of pendingWrong) {
        if (ks.wi === ev.wi) {
          ks.corrected = true;
          pendingWrong.delete(k);
        }
      }
      chainBroken = true;
      continue;
    }

    let typed: string;
    let expected: string;
    let code: string;
    let correct: boolean;
    if (ev.op === 'commit') {
      typed = ' ';
      expected = ' ';
      code = 'Space';
      const target = session.words[ev.wi];
      correct = target === undefined || target === '' ? true : ev.ci >= target.length;
      for (const [k, ks] of pendingWrong) if (ks.wi === ev.wi) pendingWrong.delete(k); // uncorrected errors stay corrected=false
    } else {
      typed = ev.typed ?? '';
      expected = ev.expected ?? '';
      code = ev.code ?? codeForChar(typed) ?? '';
      correct = ev.correct ?? typed === expected;
    }

    const info = keyInfo(code) ?? keyInfo(codeForChar(typed) ?? '');
    if (!info) {
      chainBroken = true; // a key outside the US QWERTY map: cannot be attributed to a finger, so skip it
      continue;
    }

    const rec = findDown(downs, code, ev.t);
    const ikiRaw = prevKs ? ev.t - prevKs.t : null;
    const ks: Keystroke = {
      sessionId: session.id,
      idx: out.length,
      t: ev.t,
      code,
      typed,
      expected,
      correct,
      corrected: false,
      wi: ev.wi,
      ci: ev.ci,
      prev: prevKs && !chainBroken ? prevKs.typed : null,
      ikiMs: ikiRaw !== null && ikiRaw <= pauseMs ? ikiRaw : null,
      holdMs: rec && rec.upT !== null ? Math.round((rec.upT - rec.t) * 10) / 10 : null,
      flightMs: rec && prevRec && prevRec.upT !== null ? Math.round((rec.t - prevRec.upT) * 10) / 10 : null,
      rollover: false,
      finger: info.finger,
      hand: info.hand,
      row: info.row,
    };
    ks.rollover = ks.flightMs !== null && ks.flightMs < 0;
    if (ev.op === 'ins' && !correct) pendingWrong.set(`${ev.wi}:${ev.ci}`, ks);

    out.push(ks);
    prevKs = ks;
    prevRec = rec;
    chainBroken = false;
  }
  return out;
}
