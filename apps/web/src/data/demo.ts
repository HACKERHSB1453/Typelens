/**
 * Demo sessions, shown until the user has real ones. They are generated in EXACTLY the format the
 * extension records (key down/up + input events), so the demo runs through the same @typelens/core
 * pipeline as real data — nothing about the analysis is faked, only the typist.
 *
 * The simulated typist gets faster over 90 days, has a few slow transitions (th, in, ng, st, ...), hits
 * neighbouring keys by mistake (usually fixing them with Backspace), rolls over at speed and pauses now and then.
 */
import { codeForChar, deriveKeystrokes, mulberry32, sessionStats, type InputEvent, type KeyEvent, type Session, type SessionConfig } from '@typelens/core';
import { PRACTICE_WORDS } from './practiceWords';
import type { SessionStore } from './store';

const DAY = 86_400_000;
const SLOW_BIGRAMS: Record<string, number> = { th: 70, in: 45, ng: 55, st: 60, ou: 40, io: 50, tr: 45, ea: 35, ck: 65, ph: 80 };
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/** keys physically next to `ch` on QWERTY (same row left/right, plus the keys above/below) */
function neighbours(ch: string): string[] {
  const out: string[] = [];
  ROWS.forEach((row, r) => {
    const i = row.indexOf(ch);
    if (i < 0) return;
    for (const d of [-1, 1]) if (row[i + d]) out.push(row[i + d] as string);
    for (const rr of [r - 1, r + 1]) {
      const other = ROWS[rr];
      if (!other) continue;
      for (const j of [i, i + 1]) if (other[j]) out.push(other[j] as string);
    }
  });
  return out.length ? out : ['e'];
}

const CONFIGS: Array<Pick<SessionConfig, 'mode' | 'mode2'> & { weight: number }> = [
  { mode: 'time', mode2: '60', weight: 5 },
  { mode: 'time', mode2: '30', weight: 3 },
  { mode: 'time', mode2: '15', weight: 1 },
  { mode: 'words', mode2: '50', weight: 2 },
];

function simulate(rng: () => number, id: string, startedAt: number, skill: number, restarted: boolean): Session {
  let pick = rng() * CONFIGS.reduce((s, c) => s + c.weight, 0);
  const cfgBase = CONFIGS.find((c) => (pick -= c.weight) < 0) ?? (CONFIGS[0] as (typeof CONFIGS)[number]);
  const config: SessionConfig = { mode: cfgBase.mode, mode2: cfgBase.mode2, language: 'english', punctuation: false, numbers: false, funbox: [] };
  const limitMs = config.mode === 'time' ? Number(config.mode2) * 1000 : Infinity;
  const wordLimit = config.mode === 'words' ? Number(config.mode2) : 400;
  const common = PRACTICE_WORDS.filter((w) => w.length <= 8);
  const words = Array.from({ length: wordLimit }, () => common[Math.floor(rng() * common.length)] as string);

  const baseIki = 235 - 95 * skill; // ms between keys
  const baseHold = 112 - 20 * skill; // holds shrink less than gaps, so fast typing overlaps keys (rollover)
  const errRate = 0.065 - 0.045 * skill;
  const stopAt = restarted ? 4000 + rng() * 6000 : limitMs;

  const keyEvents: KeyEvent[] = [];
  const inputEvents: InputEvent[] = [];
  let t = 0;
  let prevCh = '';
  let first = true;

  const press = (ch: string, extra: number): number => {
    if (!first) t += Math.max(35, baseIki * (0.55 + rng() * 0.9) + extra);
    if (!first && rng() < 0.004) t += 2200 + rng() * 1500; // a hesitation
    first = false;
    const code = ch === 'Backspace' ? 'Backspace' : (codeForChar(ch) ?? 'KeyE');
    const key = ch === 'Backspace' ? 'Backspace' : ch;
    const hold = baseHold * (0.8 + rng() * 0.4);
    keyEvents.push({ t: round1(t), type: 'down', code, key }, { t: round1(t + hold), type: 'up', code, key });
    return round1(t);
  };

  for (let wi = 0; wi < words.length && t < stopAt; wi++) {
    const w = words[wi] as string;
    for (let ci = 0; ci < w.length; ci++) {
      const ch = w[ci] as string;
      const slow = (SLOW_BIGRAMS[prevCh + ch] ?? 0) * (1 - 0.45 * skill);
      if (rng() < errRate) {
        const wrong = neighbours(ch)[Math.floor(rng() * neighbours(ch).length)] as string;
        const at = press(wrong, slow);
        inputEvents.push({ t: at, op: 'ins', wi, ci, typed: wrong, expected: ch, correct: false, code: codeForChar(wrong) ?? 'KeyE' });
        if (rng() < 0.8) {
          const bs = press('Backspace', 120); // noticing the mistake takes a moment
          inputEvents.push({ t: bs, op: 'del', wi, ci, code: 'Backspace' });
        } else {
          prevCh = wrong;
          continue; // left uncorrected
        }
      }
      const at = press(ch, slow);
      inputEvents.push({ t: at, op: 'ins', wi, ci, typed: ch, expected: ch, correct: true, code: codeForChar(ch) ?? 'KeyE' });
      prevCh = ch;
    }
    if (t >= stopAt) break;
    const at = press(' ', 15);
    inputEvents.push({ t: at, op: 'commit', wi, ci: w.length, code: 'Space' });
    prevCh = ' ';
  }

  const lastWi = inputEvents.reduce((m, e) => Math.max(m, e.wi), 0);
  const session: Session = {
    v: 1,
    id,
    startedAt,
    source: 'monkeytype',
    config,
    words: words.slice(0, lastWi + 10),
    keyEvents,
    inputEvents,
    completed: !restarted,
    flags: restarted ? ['restart'] : [],
    client: { extVersion: 'demo' },
  };
  if (!restarted) {
    // what Monkeytype's result screen would have shown
    const dur = config.mode === 'time' ? Number(config.mode2) : round1(t / 1000);
    const timed: Session = { ...session, result: { wpm: 0, rawWpm: 0, acc: 0, consistency: 0, testDurationSec: dur } };
    const st = sessionStats(timed, deriveKeystrokes(timed));
    session.result = { wpm: round2(st.wpm), rawWpm: round2(st.rawWpm), acc: round2(st.acc), consistency: round2(st.consistency), testDurationSec: dur };
  }
  return session;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;
const round2 = (x: number): number => Math.round(x * 100) / 100;

export function generateDemoSessions(now: number, count = 60, seed = 20260920): Session[] {
  const rng = mulberry32(seed);
  const out: Session[] = [];
  for (let i = 0; i < count; i++) {
    const daysAgo = 89 * Math.pow(rng(), 0.8); // a bit denser recently
    const startedAt = Math.round(now - daysAgo * DAY);
    const skill = Math.min(1, Math.max(0, (90 - daysAgo) / 90 + (rng() - 0.5) * 0.15));
    out.push(simulate(rng, `demo-${i.toString().padStart(3, '0')}`, startedAt, skill, rng() < 0.05));
  }
  return out.sort((a, b) => a.startedAt - b.startedAt);
}

/** An in-memory SessionStore (the demo never touches IndexedDB). */
export function memoryStore(initial: Session[] = []): SessionStore {
  const m = new Map(initial.map((s) => [s.id, s]));
  return {
    async putMany(sessions) {
      let added = 0;
      let skipped = 0;
      for (const s of sessions) {
        if (m.has(s.id)) skipped++;
        else {
          m.set(s.id, s);
          added++;
        }
      }
      return { added, skipped };
    },
    async all() {
      return [...m.values()].sort((a, b) => a.startedAt - b.startedAt);
    },
    async has(id) {
      return m.has(id);
    },
    async count() {
      return m.size;
    },
    async delete(id) {
      m.delete(id);
    },
    async clear() {
      m.clear();
    },
  };
}
