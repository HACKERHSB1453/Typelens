/** CSV export and validated JSON import. Everything read from a file is untrusted, so every field is checked. */
import type { Keystroke, Session } from './schema';
import { deriveKeystrokes } from './derive';
import { sessionSeconds, sessionStats } from './analyze';

// ------------------------------------------------------------------ CSV (RFC 4180)

function cell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(header: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function sessionsToCsv(sessions: readonly Session[]): string {
  const header = ['id', 'startedAt', 'mode', 'mode2', 'language', 'punctuation', 'numbers', 'wpm', 'rawWpm', 'acc', 'consistency', 'durationSec', 'keystrokes', 'completed', 'flags'];
  const rows = sessions.map((s) => {
    const ks = deriveKeystrokes(s);
    const st = sessionStats(s, ks);
    return [
      s.id,
      new Date(s.startedAt).toISOString(),
      s.config.mode,
      s.config.mode2,
      s.config.language,
      s.config.punctuation,
      s.config.numbers,
      s.result?.wpm ?? Math.round(st.wpm * 100) / 100,
      s.result?.rawWpm ?? Math.round(st.rawWpm * 100) / 100,
      s.result?.acc ?? Math.round(st.acc * 100) / 100,
      s.result?.consistency ?? Math.round(st.consistency * 100) / 100,
      Math.round(sessionSeconds(s, ks) * 100) / 100,
      ks.length,
      s.completed,
      s.flags.join('|'),
    ];
  });
  return csv(header, rows);
}

const KEYSTROKE_FIELDS: Array<keyof Keystroke> = ['sessionId', 'idx', 't', 'code', 'typed', 'expected', 'correct', 'corrected', 'wi', 'ci', 'prev', 'ikiMs', 'holdMs', 'flightMs', 'rollover', 'finger', 'hand', 'row'];

export function keystrokesToCsv(sessions: readonly Session[]): string {
  const rows = sessions.flatMap((s) => deriveKeystrokes(s).map((k) => KEYSTROKE_FIELDS.map((f) => k[f] as string | number | boolean | null)));
  return csv(KEYSTROKE_FIELDS as string[], rows);
}

// ------------------------------------------------------------------ JSON import

const MODES = ['time', 'words', 'quote', 'zen', 'custom'];
const FLAGS = ['ime', 'restart', 'blur', 'captureUnreliable'];
const OPS = ['ins', 'del', 'wdel', 'commit'];

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';

/** Returns a description of the first problem, or null when the session is valid. */
export function validateSession(x: unknown): string | null {
  if (!isObj(x)) return 'not an object';
  if (x.v !== 1) return `unsupported version ${String(x.v)}`;
  if (!isStr(x.id) || x.id.length === 0) return 'missing id';
  if (!isNum(x.startedAt)) return 'startedAt is not a number';
  if (x.source !== 'monkeytype' && x.source !== 'monkeytype-history') return 'unknown source';
  if (x.source === 'monkeytype-history' && (!isObj(x.history) || !isStr(x.history.mtId))) return 'invalid history';
  const c = x.config;
  if (!isObj(c)) return 'missing config';
  if (!isStr(c.mode) || !MODES.includes(c.mode)) return 'invalid config.mode';
  if (!isStr(c.mode2) || !isStr(c.language)) return 'invalid config.mode2/language';
  if (typeof c.punctuation !== 'boolean' || typeof c.numbers !== 'boolean') return 'invalid config flags';
  if (!Array.isArray(c.funbox) || !c.funbox.every(isStr)) return 'invalid config.funbox';
  if (!Array.isArray(x.words) || !x.words.every(isStr)) return 'invalid words';
  if (typeof x.completed !== 'boolean') return 'invalid completed';
  if (!Array.isArray(x.flags) || !x.flags.every((f) => isStr(f) && FLAGS.includes(f))) return 'invalid flags';
  if (!isObj(x.client) || !isStr(x.client.extVersion)) return 'invalid client';
  if (!Array.isArray(x.keyEvents)) return 'invalid keyEvents';
  for (const e of x.keyEvents) {
    if (!isObj(e) || !isNum(e.t) || (e.type !== 'down' && e.type !== 'up') || !isStr(e.code) || !isStr(e.key)) return 'invalid key event';
  }
  if (!Array.isArray(x.inputEvents)) return 'invalid inputEvents';
  for (const e of x.inputEvents) {
    if (!isObj(e) || !isNum(e.t) || !isStr(e.op) || !OPS.includes(e.op) || !Number.isInteger(e.wi) || !Number.isInteger(e.ci)) return 'invalid input event';
    if (e.op === 'ins' && (!isStr(e.typed) || !isStr(e.expected))) return 'invalid ins event';
  }
  if (x.result !== undefined) {
    const r = x.result;
    if (!isObj(r) || !isNum(r.wpm) || !isNum(r.rawWpm) || !isNum(r.acc) || !isNum(r.consistency) || !isNum(r.testDurationSec)) return 'invalid result';
  }
  return null;
}

export function parseImport(json: unknown): { sessions: Session[]; errors: string[] } {
  const list = Array.isArray(json) ? json : isObj(json) && Array.isArray(json.sessions) ? json.sessions : null;
  if (!list) return { sessions: [], errors: ['expected {"v":1,"sessions":[...]} or an array of sessions'] };
  const sessions: Session[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  list.forEach((item, i) => {
    const problem = validateSession(item);
    if (problem) {
      errors.push(`session #${i + 1}: ${problem}`);
      return;
    }
    const s = item as Session;
    if (seen.has(s.id)) {
      errors.push(`session #${i + 1}: duplicate id ${s.id}`);
      return;
    }
    seen.add(s.id);
    sessions.push(s);
  });
  return { sessions, errors };
}
