import { describe, expect, it } from 'vitest';
import type { SessionConfig } from '@typelens/core/schema';
import { Recorder, MIN_INPUTS } from '../src/recorder';

const CFG: SessionConfig = { mode: 'time', mode2: '30', language: 'english', punctuation: false, numbers: false, funbox: [] };
const RESULT = { wpm: 60, rawWpm: 62, acc: 97, consistency: 80, testDurationSec: 30 };

function makeRecorder() {
  let n = 0;
  const r = new Recorder({ now: () => 1_700_000_000_000, uuid: () => `id-${++n}`, extVersion: '9.9.9' });
  r.onTestConfig(CFG);
  return r;
}
const WORDS = [
  { wi: 0, text: 'cat' },
  { wi: 1, text: 'dog' },
  { wi: 2, text: 'sun' },
];

/** press = keydown at t, input at t+1 (like a browser), keyup at t+hold */
function press(r: Recorder, t: number, ch: string, ctx: { wi: number; ci: number; expected: string }, hold = 80, code?: string) {
  const c = code ?? (ch === ' ' ? 'Space' : `Key${ch.toUpperCase()}`);
  r.onKeyDown({ code: c, key: ch, t, repeat: false, isComposing: false });
  r.onInput({ inputType: 'insertText', data: ch, isComposing: false, t: t + 1 }, { wi: ctx.wi, ci: ctx.ci, expectedChar: ctx.expected });
  r.onKeyUp({ code: c, key: ch, t: t + hold });
}

function typeWord(r: Recorder, startT: number, wi: number, word: string, step = 150) {
  let t = startT;
  [...word].forEach((ch, ci) => {
    press(r, t, ch, { wi, ci, expected: word[ci] ?? '' });
    t += step;
  });
  return t;
}

describe('Recorder', () => {
  it('records keydown/keyup/inputs, rebased to the first keydown, rounded to 0.1 ms', () => {
    const r = makeRecorder();
    r.onWords(WORDS);
    let t = typeWord(r, 10_000.04, 0, 'cat'); // t0 = 10000.04
    // commit (space)
    r.onKeyDown({ code: 'Space', key: ' ', t, repeat: false, isComposing: false });
    r.onInput({ inputType: 'insertText', data: ' ', isComposing: false, t: t + 1 }, { wi: 0, ci: 3, expectedChar: '' });
    r.onKeyUp({ code: 'Space', key: ' ', t: t + 70 });
    t += 150;
    t = typeWord(r, t, 1, 'dog');
    const s = r.onResult(RESULT)!;
    expect(s).not.toBeNull();
    expect(s.v).toBe(1);
    expect(s.id).toBe('id-1');
    expect(s.completed).toBe(true);
    expect(s.result).toEqual(RESULT);
    expect(s.client.extVersion).toBe('9.9.9');
    expect(s.keyEvents[0]).toEqual({ t: 0, type: 'down', code: 'KeyC', key: 'c' });
    expect(s.keyEvents[1]).toEqual({ t: 80, type: 'up', code: 'KeyC', key: 'c' });
    // the second keydown is 150 ms after the first (10000.04 -> 10150.04)
    expect(s.keyEvents[2]).toEqual({ t: 150, type: 'down', code: 'KeyA', key: 'a' });
    const ins = s.inputEvents.filter((e) => e.op === 'ins');
    expect(ins.map((e) => e.typed).join('')).toBe('catdog');
    expect(ins.every((e) => e.correct === true)).toBe(true);
    expect(s.inputEvents.find((e) => e.op === 'commit')).toMatchObject({ wi: 0, ci: 3, code: 'Space' });
    expect(s.inputEvents[0]).toMatchObject({ t: 0, op: 'ins', wi: 0, ci: 0, typed: 'c', expected: 'c', code: 'KeyC' });
  });

  it('marks wrong characters, keeps del and wdel, and stores the expected char', () => {
    const r = makeRecorder();
    r.onWords(WORDS);
    press(r, 1000, 'c', { wi: 0, ci: 0, expected: 'c' });
    press(r, 1150, 'x', { wi: 0, ci: 1, expected: 'a' }); // wrong
    r.onKeyDown({ code: 'Backspace', key: 'Backspace', t: 1300, repeat: false, isComposing: false });
    r.onInput({ inputType: 'deleteContentBackward', data: null, isComposing: false, t: 1301 }, { wi: 0, ci: 1, expectedChar: '' });
    r.onKeyUp({ code: 'Backspace', key: 'Backspace', t: 1380 });
    press(r, 1450, 'a', { wi: 0, ci: 1, expected: 'a' });
    press(r, 1600, 't', { wi: 0, ci: 2, expected: 't' });
    r.onKeyDown({ code: 'Backspace', key: 'Backspace', t: 1750, repeat: false, isComposing: false });
    r.onInput({ inputType: 'deleteWordBackward', data: null, isComposing: false, t: 1751 }, { wi: 0, ci: 0, expectedChar: '' });
    press(r, 1900, 'c', { wi: 0, ci: 0, expected: 'c' });
    const s = r.onResult(RESULT)!;
    const ops = s.inputEvents.map((e) => e.op);
    expect(ops).toEqual(['ins', 'ins', 'del', 'ins', 'ins', 'wdel', 'ins']);
    expect(s.inputEvents[1]).toMatchObject({ typed: 'x', expected: 'a', correct: false });
    expect(s.inputEvents[2]).toMatchObject({ op: 'del', wi: 0, ci: 1, code: 'Backspace' });
    // Backspace keydown/keyup are recorded as key events
    expect(s.keyEvents.some((k) => k.code === 'Backspace' && k.type === 'down')).toBe(true);
  });

  it('records rollover: the next keydown happens before the previous keyup', () => {
    const r = makeRecorder();
    r.onWords(WORDS);
    r.onKeyDown({ code: 'KeyC', key: 'c', t: 5000, repeat: false, isComposing: false });
    r.onInput({ inputType: 'insertText', data: 'c', isComposing: false, t: 5001 }, { wi: 0, ci: 0, expectedChar: 'c' });
    r.onKeyDown({ code: 'KeyA', key: 'a', t: 5060, repeat: false, isComposing: false });
    r.onInput({ inputType: 'insertText', data: 'a', isComposing: false, t: 5061 }, { wi: 0, ci: 1, expectedChar: 'a' });
    r.onKeyUp({ code: 'KeyC', key: 'c', t: 5100 });
    r.onKeyUp({ code: 'KeyA', key: 'a', t: 5140 });
    typeWord(r, 5300, 0, 'ca');
    typeWord(r, 5600, 1, 'dog');
    const s = r.onResult(RESULT)!;
    expect(s.keyEvents.slice(0, 4).map((k) => `${k.type}:${k.code}@${k.t}`)).toEqual(['down:KeyC@0', 'down:KeyA@60', 'up:KeyC@100', 'up:KeyA@140']);
  });

  it('ignores key repeat, modifiers, arrows and stray keyups', () => {
    const r = makeRecorder();
    r.onWords(WORDS);
    r.onKeyDown({ code: 'ShiftLeft', key: 'Shift', t: 90, repeat: false, isComposing: false });
    r.onKeyDown({ code: 'ArrowLeft', key: 'ArrowLeft', t: 95, repeat: false, isComposing: false });
    r.onKeyUp({ code: 'KeyQ', key: 'q', t: 96 }); // never saw its keydown
    r.onKeyDown({ code: 'KeyC', key: 'c', t: 100, repeat: false, isComposing: false });
    r.onKeyDown({ code: 'KeyC', key: 'c', t: 130, repeat: true, isComposing: false });
    r.onInput({ inputType: 'insertText', data: 'c', isComposing: false, t: 101 }, { wi: 0, ci: 0, expectedChar: 'c' });
    r.onKeyUp({ code: 'KeyC', key: 'c', t: 170 });
    typeWord(r, 300, 0, 'ca');
    typeWord(r, 700, 1, 'dog');
    const s = r.onResult(RESULT)!;
    expect(s.keyEvents.filter((k) => k.code === 'ShiftLeft' || k.code === 'ArrowLeft' || k.code === 'KeyQ')).toHaveLength(0);
    expect(s.keyEvents.filter((k) => k.code === 'KeyC' && k.type === 'down')).toHaveLength(2); // the repeat was ignored
  });

  it('flags IME/dead keys and ignores multi-character inserts and pastes', () => {
    const r = makeRecorder();
    r.onWords(WORDS);
    typeWord(r, 100, 0, 'cat');
    r.onKeyDown({ code: 'KeyA', key: 'Dead', t: 500, repeat: false, isComposing: false });
    r.onInput({ inputType: 'insertText', data: 'long pasted text', isComposing: false, t: 501 }, { wi: 0, ci: 3, expectedChar: '' });
    r.onInput({ inputType: 'insertFromPaste', data: 'x', isComposing: false, t: 502 }, { wi: 0, ci: 3, expectedChar: '' });
    r.onInput({ inputType: 'insertCompositionText', data: 'x', isComposing: true, t: 503 }, { wi: 0, ci: 3, expectedChar: '' });
    typeWord(r, 700, 1, 'dog');
    const s = r.onResult(RESULT)!;
    expect(s.flags).toContain('ime');
    expect(s.inputEvents.filter((e) => e.op === 'ins')).toHaveLength(6); // only the six real single-character inserts
  });

  it('drops sessions with fewer than MIN_INPUTS typed characters', () => {
    const r = makeRecorder();
    r.onWords(WORDS);
    typeWord(r, 100, 0, 'cat');
    expect(r.snapshot()).toMatchObject({ active: true, inputs: 3 });
    expect(r.onResult(RESULT)).toBeNull();
    expect(r.snapshot().active).toBe(false);
  });

  it('does nothing until config and words are known, and never starts on a delete', () => {
    const r = new Recorder({ now: () => 1, uuid: () => 'x', extVersion: '1' });
    press(r, 100, 'c', { wi: 0, ci: 0, expected: 'c' }); // no config, no words
    expect(r.snapshot().active).toBe(false);
    r.onTestConfig(CFG);
    r.onWords(WORDS);
    r.onKeyDown({ code: 'Backspace', key: 'Backspace', t: 200, repeat: false, isComposing: false });
    r.onInput({ inputType: 'deleteContentBackward', data: null, isComposing: false, t: 201 }, { wi: 0, ci: 0, expectedChar: '' });
    expect(r.snapshot().active).toBe(false);
  });

  it('a restart flushes the in-progress session as incomplete with the restart flag', () => {
    const r = makeRecorder();
    r.onWords(WORDS);
    typeWord(r, 100, 0, 'cat');
    typeWord(r, 700, 1, 'dog');
    const flushed = r.onRestart()!;
    expect(flushed.completed).toBe(false);
    expect(flushed.flags).toContain('restart');
    expect(flushed.result).toBeUndefined();
    expect(r.snapshot().active).toBe(false);
    expect(r.onRestart()).toBeNull();
  });

  it('a regenerated wordset during a test is treated as a restart, but a few changed words are not', () => {
    const many = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff'].map((text, wi) => ({ wi, text }));
    const r = makeRecorder();
    r.onWords(many);
    typeWord(r, 100, 0, 'aa');
    typeWord(r, 500, 1, 'bb');
    typeWord(r, 900, 2, 'cc');
    // "replace typos" rewrote one letter of one word: not a restart
    expect(r.onWords(many.map((w) => (w.wi === 1 ? { ...w, text: 'bx' } : w)))).toBeNull();
    expect(r.snapshot().active).toBe(true);
    // every word is different: restart
    const flushed = r.onWords(['ga', 'gb', 'gc', 'gd', 'ge', 'gf'].map((text, wi) => ({ wi, text })));
    expect(flushed?.flags).toContain('restart');
    expect(flushed?.words[1]).toBe('bb'); // first-seen text wins over the typo rendering
    expect(r.snapshot().active).toBe(false);
  });

  it('adds the blur flag and trims the stored word list to what was reached plus a lookahead', () => {
    const r = makeRecorder();
    r.onWords(Array.from({ length: 100 }, (_, wi) => ({ wi, text: `w${wi}` })));
    typeWord(r, 100, 0, 'w0');
    r.onBlur();
    typeWord(r, 500, 1, 'w1');
    typeWord(r, 900, 2, 'w2');
    const s = r.onResult(RESULT)!;
    expect(s.flags).toContain('blur');
    expect(s.words).toHaveLength(2 + 10 + 1); // maxWi (2) + lookahead (10) + 1
    expect(s.words[12]).toBe('w12');
  });
});
