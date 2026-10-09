/**
 * Monkeytype's own results export (Account -> "export CSV"). One row per test with the result numbers only —
 * Monkeytype never stored keystrokes. These become `monkeytype-history` sessions: they fill in speed/accuracy
 * history, trends and streaks, but have no replay and no key/n-gram/finger data.
 */
import type { Session, SessionConfig } from './schema';

const COLUMNS = ['_id', 'wpm', 'acc', 'rawWpm', 'consistency', 'charStats', 'mode', 'mode2', 'testDuration', 'timestamp'] as const;
const MODES: SessionConfig['mode'][] = ['time', 'words', 'quote', 'zen', 'custom'];

/** RFC 4180 CSV -> rows of fields (handles quoted fields with commas, quotes and newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

/** True when the text looks like Monkeytype's results export (checked by its header). */
export function isMonkeytypeResultsCsv(text: string): boolean {
  const header = (text.split(/\r?\n/, 1)[0] ?? '').split(',');
  return COLUMNS.every((c) => header.includes(c));
}

const num = (s: string | undefined): number => (s === undefined || s.trim() === '' ? Number.NaN : Number(s));
const bool = (s: string | undefined): boolean => s === 'true';

export function parseMonkeytypeResultsCsv(text: string): { sessions: Session[]; errors: string[] } {
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header || !COLUMNS.every((c) => header.includes(c))) {
    return { sessions: [], errors: ['This does not look like a Monkeytype results export (missing columns).'] };
  }
  const col = (name: string): number => header.indexOf(name);
  const get = (r: string[], name: string): string | undefined => {
    const i = col(name);
    return i >= 0 ? r[i] : undefined;
  };

  const sessions: Session[] = [];
  const errors: string[] = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    const id = get(r, '_id') ?? '';
    const wpm = num(get(r, 'wpm'));
    const acc = num(get(r, 'acc'));
    const dur = num(get(r, 'testDuration'));
    const end = num(get(r, 'timestamp'));
    const mode = (get(r, 'mode') ?? '') as SessionConfig['mode'];
    if (!id || !Number.isFinite(wpm) || !Number.isFinite(acc) || !Number.isFinite(dur) || !Number.isFinite(end) || !MODES.includes(mode)) {
      errors.push(`line ${line}: missing or invalid values`);
      return;
    }
    const raw = num(get(r, 'rawWpm'));
    const cons = num(get(r, 'consistency'));
    const chars = (get(r, 'charStats') ?? '').split(';').map(Number);
    const funbox = (get(r, 'funbox') ?? '').split('#').filter((f) => f && f !== 'none');
    const difficulty = get(r, 'difficulty');
    const config: SessionConfig = {
      mode,
      mode2: get(r, 'mode2') ?? '',
      language: get(r, 'language') || 'english',
      punctuation: bool(get(r, 'punctuation')),
      numbers: bool(get(r, 'numbers')),
      funbox,
    };
    if (difficulty === 'normal' || difficulty === 'expert' || difficulty === 'master') config.difficulty = difficulty;
    const session: Session = {
      v: 1,
      id: `mt-${id}`,
      // Monkeytype's timestamp marks the END of the test
      startedAt: Math.round(end - dur * 1000),
      source: 'monkeytype-history',
      config,
      words: [],
      keyEvents: [],
      inputEvents: [],
      result: {
        wpm,
        rawWpm: Number.isFinite(raw) ? raw : wpm,
        acc,
        consistency: Number.isFinite(cons) ? cons : 0,
        testDurationSec: dur,
      },
      completed: !bool(get(r, 'bailedOut')),
      flags: [],
      client: { extVersion: 'monkeytype-export' },
      history: {
        mtId: id,
        isPb: bool(get(r, 'isPb')),
        restartCount: Number.isFinite(num(get(r, 'restartCount'))) ? num(get(r, 'restartCount')) : 0,
        afkDurationSec: Number.isFinite(num(get(r, 'afkDuration'))) ? num(get(r, 'afkDuration')) : 0,
        tags: (get(r, 'tags') ?? '').split('#').filter(Boolean),
      },
    };
    if (chars.length === 4 && chars.every((n) => Number.isFinite(n)) && session.result) {
      session.result.charStats = chars as [number, number, number, number];
    }
    sessions.push(session);
  });
  return { sessions, errors };
}

/**
 * A history row describing a test the extension also recorded. The recording is richer, so the row is dropped.
 * Same mode/mode2, ends within 3 s of each other, and the same WPM (to 0.5).
 */
export function isSameTest(history: Session, recorded: Session): boolean {
  if (!history.result || !recorded.result) return false;
  if (history.config.mode !== recorded.config.mode || history.config.mode2 !== recorded.config.mode2) return false;
  const hEnd = history.startedAt + history.result.testDurationSec * 1000;
  const rEnd = recorded.startedAt + recorded.result.testDurationSec * 1000;
  return Math.abs(hEnd - rEnd) <= 3000 && Math.abs(history.result.wpm - recorded.result.wpm) <= 0.5;
}
