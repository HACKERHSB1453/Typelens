import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analyze';
import { keystrokesToCsv, parseImport, sessionsToCsv, validateSession } from '../src/export';
import { makeSession } from '../src/fixtures';
import { generatePractice } from '../src/practice';
import { mulberry32 } from '../src/stats-util';
import type { PracticeRequest } from '../src/schema';

const WORDS = ['the', 'then', 'this', 'that', 'math', 'path', 'bath', 'thing', 'ring', 'sing', 'king', 'wing', 'cat', 'dog', 'sun', 'red', 'was', 'bad', 'tea', 'great', 'pull', 'him', 'hop', 'oil', 'jump', 'quiz', 'quick', 'ah', 'oath', 'age'];

/** 5 sessions where "th" is a slow transition */
function analysis() {
  const sessions = Array.from({ length: 5 }, (_, i) =>
    makeSession({ id: `s${i}`, text: 'the ah the ah the ah', pauses: [0, 2, 4].map((wi) => ({ wi, ci: 1, ms: 100 })) }),
  );
  return analyze(sessions);
}
const opts = (seed = 7) => ({ rng: mulberry32(seed), now: 1234 });
const req = (over: Partial<PracticeRequest> = {}): PracticeRequest => ({ focus: { kind: 'auto' }, length: 30, emphasis: 'balanced', hand: 'both', ...over });

describe('generatePractice', () => {
  it('auto focus targets the slowest transition and produces real words from the list', () => {
    const a = analysis();
    expect(a.bigrams[0]!.gram).toBe('th'); // sanity: th is the weak spot
    const r = generatePractice(req({ emphasis: 'speed' }), a, WORDS, opts());
    expect(r.focus).toContain('th');
    expect(r.words).toHaveLength(30);
    expect(r.text).toBe(r.words.join(' '));
    expect(r.words.every((w) => WORDS.includes(w))).toBe(true);
    expect(r.generatedAt).toBe(1234);
    expect(r.coverage.th).toBeGreaterThanOrEqual(1);
    // th-words dominate the text but are capped at 40% so the drill stays varied
    expect(r.coverage.th).toBeLessThanOrEqual(Math.ceil(0.4 * 30));
    // coverage reports how many generated words really contain the item
    expect(r.coverage.th).toBe(r.words.filter((w) => w.includes('th')).length);
  });

  it('never places the same word twice in a row', () => {
    const r = generatePractice(req({ length: 200, focus: { kind: 'grams', grams: ['th'] } }), analysis(), WORDS, opts(3));
    for (let i = 1; i < r.words.length; i++) expect(r.words[i]).not.toBe(r.words[i - 1]);
  });

  it('is deterministic for a given seed and differs across seeds', () => {
    const a = analysis();
    const one = generatePractice(req(), a, WORDS, opts(11)).text;
    expect(generatePractice(req(), a, WORDS, opts(11)).text).toBe(one);
    expect(generatePractice(req(), a, WORDS, opts(12)).text).not.toBe(one);
  });

  it('honours an explicit gram focus even with no measurements', () => {
    const r = generatePractice(req({ length: 10, focus: { kind: 'grams', grams: ['ing'] } }), analyze([]), WORDS, opts());
    expect(r.focus).toEqual(['ing']);
    expect(r.coverage.ing).toBeGreaterThanOrEqual(1); // thing, ring, sing, king, wing
    expect(r.coverage.ing).toBeLessThanOrEqual(4); // 40% cap of 10
    expect(r.words).toHaveLength(10);
  });

  it('supports key and finger focus, skipping keys that make no sense inside words', () => {
    const q = generatePractice(req({ length: 8, focus: { kind: 'keys', codes: ['KeyQ', 'Space'] } }), analyze([]), WORDS, opts());
    expect(q.focus).toEqual(['q']);
    expect(q.words.some((w) => w.includes('q'))).toBe(true);
    const f = generatePractice(req({ length: 8, focus: { kind: 'fingers', fingers: ['LP'] } }), analyze([]), WORDS, opts());
    expect(f.focus).toEqual(expect.arrayContaining(['q', 'a', 'z']));
  });

  it('left-hand practice uses only left-hand letters when enough words exist', () => {
    const left = new Set('qwertasdfgzxcvb');
    const r = generatePractice(req({ length: 6, hand: 'L', focus: { kind: 'grams', grams: ['ea'] } }), analyze([]), ['tea', 'red', 'was', 'bad', 'great', 'cat', 'pull', 'him', 'hop', 'dog'], opts());
    expect(r.words.every((w) => [...w].every((c) => left.has(c)))).toBe(true);
  });

  it('right-hand practice falls back to mostly-right words when the strict set is tiny', () => {
    const r = generatePractice(req({ length: 40, hand: 'R', focus: { kind: 'auto' } }), analyze([]), ['pull', 'him', 'hop', 'oil', 'cat', 'sun', 'age', 'quiz', 'jump', 'king'], opts());
    const right = new Set('yuiophjklnm');
    expect(r.words.every((w) => [...w].filter((c) => right.has(c)).length / w.length >= 0.7)).toBe(true);
  });

  it('with no data and auto focus it still returns words, with an empty focus', () => {
    const r = generatePractice(req({ length: 12 }), analyze([]), WORDS, opts());
    expect(r.focus).toEqual([]);
    expect(r.words).toHaveLength(12);
  });

  it('handles an empty word list and clamps the length', () => {
    expect(generatePractice(req(), analysis(), [], opts()).words).toEqual([]);
    expect(generatePractice(req({ length: 9999 }), analyze([]), WORDS, opts()).words).toHaveLength(500);
    expect(generatePractice(req({ length: 0 }), analyze([]), WORDS, opts()).words).toHaveLength(1);
  });
});

describe('CSV export', () => {
  it('writes one row per session with RFC 4180 quoting', () => {
    const s = makeSession({ id: 'a"b,c', text: 'cat dog', config: { language: 'en,glish' }, result: { wpm: 60.5, rawWpm: 62, acc: 97, consistency: 80, testDurationSec: 7 } });
    const rows = sessionsToCsv([s]).trim().split('\r\n');
    expect(rows[0]).toBe('id,startedAt,mode,mode2,language,punctuation,numbers,wpm,rawWpm,acc,consistency,durationSec,keystrokes,completed,flags');
    expect(rows[1]).toBe('"a""b,c",2023-11-14T22:13:20.000Z,time,30,"en,glish",false,false,60.5,62,97,80,7,8,true,');
  });

  it('writes one row per keystroke with every field, quoting commas and quotes in typed characters', () => {
    const s = makeSession({ id: 'k', text: 'a,' });
    const lines = keystrokesToCsv([s]).trim().split('\r\n');
    expect(lines[0]).toBe('sessionId,idx,t,code,typed,expected,correct,corrected,wi,ci,prev,ikiMs,holdMs,flightMs,rollover,finger,hand,row');
    expect(lines).toHaveLength(1 + 3); // a , ␣
    expect(lines[1]).toBe('k,0,0,KeyA,a,a,true,false,0,0,,,90,,false,LP,L,home');
    expect(lines[2]).toContain('"," ,'.replace(' ', '')); // "," is quoted: k,1,150,Comma,",",",",...
    expect(lines[2]!.startsWith('k,1,150,Comma,",",",",true')).toBe(true);
  });

  it('exports header only for no sessions', () => {
    expect(keystrokesToCsv([]).trim().split('\r\n')).toHaveLength(1);
  });
});

describe('JSON import', () => {
  const good = () => makeSession({ id: 'good', text: 'ab' });

  it('accepts {v:1,sessions} and bare arrays, and reports every bad session', () => {
    const bad1 = { ...good(), id: 'bad1', keyEvents: 'nope' };
    const bad2 = { ...good(), id: 'bad2', v: 2 };
    const dup = good();
    const r = parseImport({ v: 1, sessions: [good(), bad1, bad2, dup, 5] });
    expect(r.sessions.map((s) => s.id)).toEqual(['good']);
    expect(r.errors).toEqual([
      'session #2: invalid keyEvents',
      'session #3: unsupported version 2',
      'session #4: duplicate id good',
      'session #5: not an object',
    ]);
    expect(parseImport([good()]).sessions).toHaveLength(1);
  });

  it('rejects things that are not session lists', () => {
    expect(parseImport({ nope: 1 }).errors).toHaveLength(1);
    expect(parseImport('x').sessions).toEqual([]);
    expect(parseImport(null).errors).toHaveLength(1);
  });

  it('validates every field the analysis relies on', () => {
    const s = good();
    expect(validateSession(s)).toBeNull();
    const broken = (patch: Record<string, unknown>) => validateSession({ ...s, ...patch });
    expect(broken({ id: '' })).toBe('missing id');
    expect(broken({ startedAt: 'x' })).toBe('startedAt is not a number');
    expect(broken({ source: 'other' })).toBe('unknown source');
    expect(broken({ config: { ...s.config, mode: 'nope' } })).toBe('invalid config.mode');
    expect(broken({ flags: ['weird'] })).toBe('invalid flags');
    expect(broken({ words: [1] })).toBe('invalid words');
    expect(broken({ keyEvents: [{ t: 1, type: 'sideways', code: 'a', key: 'a' }] })).toBe('invalid key event');
    expect(broken({ inputEvents: [{ t: 1, op: 'ins', wi: 0, ci: 0 }] })).toBe('invalid ins event');
    expect(broken({ inputEvents: [{ t: 1, op: 'bogus', wi: 0, ci: 0 }] })).toBe('invalid input event');
    expect(broken({ inputEvents: [{ t: NaN, op: 'del', wi: 0, ci: 0 }] })).toBe('invalid input event');
    expect(broken({ result: { wpm: 'fast' } })).toBe('invalid result');
    expect(broken({ client: {} })).toBe('invalid client');
  });

  it('round-trips a session through JSON unchanged', () => {
    const s = makeSession({ id: 'rt', text: 'hello world', errors: [{ wi: 0, ci: 1, typed: 'r' }] });
    const back = parseImport(JSON.parse(JSON.stringify({ v: 1, sessions: [s] })));
    expect(back.errors).toEqual([]);
    expect(back.sessions[0]).toEqual(s);
  });
});
