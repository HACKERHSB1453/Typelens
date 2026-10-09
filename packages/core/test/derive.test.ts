import { describe, expect, it } from 'vitest';
import { deriveKeystrokes } from '../src/derive';
import { makeSession } from '../src/fixtures';

describe('deriveKeystrokes', () => {
  it('produces one keystroke per character plus one per committing space, with exact timings', () => {
    // "at go": a(0) t(150) ␣(300) g(450) o(600) ␣(750), 150 ms apart, 90 ms hold
    const ks = deriveKeystrokes(makeSession({ text: 'at go' }));
    expect(ks.map((k) => k.typed).join('')).toBe('at go ');
    expect(ks.map((k) => k.t)).toEqual([0, 150, 300, 450, 600, 750]);
    expect(ks[0]).toMatchObject({ code: 'KeyA', finger: 'LP', hand: 'L', row: 'home', ikiMs: null, holdMs: 90, flightMs: null, prev: null, wi: 0, ci: 0, correct: true });
    expect(ks[1]).toMatchObject({ code: 'KeyT', finger: 'LI', ikiMs: 150, holdMs: 90, prev: 'a' });
    // flight = down(t)=150 - up(a)=90 = 60 ms
    expect(ks[1]!.flightMs).toBe(60);
    expect(ks[1]!.rollover).toBe(false);
    expect(ks[2]).toMatchObject({ code: 'Space', typed: ' ', expected: ' ', finger: 'RT', row: 'space', wi: 0, ci: 2, correct: true, prev: 't' });
    expect(ks[3]).toMatchObject({ typed: 'g', wi: 1, ci: 0, prev: ' ' }); // chain continues across the space
  });

  it('detects rollover: the next key goes down before the previous one is released', () => {
    const ks = deriveKeystrokes(makeSession({ text: 'ab', rollover: true }));
    // step 150, hold 190 => a: down 0 up 190; b: down 150 => flight = 150 - 190 = -40
    expect(ks[1]!.flightMs).toBe(-40);
    expect(ks[1]!.rollover).toBe(true);
    expect(ks[0]!.rollover).toBe(false);
  });

  it('marks a wrong character corrected when its position is later backspaced', () => {
    const ks = deriveKeystrokes(makeSession({ text: 'cat', errors: [{ wi: 0, ci: 1, typed: 'x' }] }));
    const wrong = ks.find((k) => !k.correct)!;
    expect(wrong).toMatchObject({ typed: 'x', expected: 'a', wi: 0, ci: 1, corrected: true });
    // the correct 'a' that follows the backspace: its `prev` is null (a delete broke the chain)
    const fixed = ks.find((k) => k.typed === 'a')!;
    expect(fixed.prev).toBeNull();
    // Backspace itself is not a keystroke row
    expect(ks.some((k) => k.code === 'Backspace')).toBe(false);
    expect(ks).toHaveLength(5); // c x a t ␣
  });

  it('leaves an uncorrected mistake as corrected=false', () => {
    const s = makeSession({ text: 'cat' });
    const target = s.inputEvents.find((e) => e.op === 'ins' && e.ci === 1)!;
    target.typed = 'x';
    target.correct = false; // typed wrong and never fixed
    const ks = deriveKeystrokes(s);
    expect(ks.find((k) => !k.correct)).toMatchObject({ typed: 'x', corrected: false });
  });

  it('handles word deletion (wdel) by marking that word\'s pending errors corrected', () => {
    const s = makeSession({ text: 'cat' });
    const ins = s.inputEvents.filter((e) => e.op === 'ins');
    ins[1]!.typed = 'x';
    ins[1]!.correct = false;
    s.inputEvents.splice(2, 0, { t: 999, op: 'wdel', wi: 0, ci: 0, code: 'Backspace' });
    const ks = deriveKeystrokes(s);
    expect(ks.find((k) => k.typed === 'x')?.corrected).toBe(true);
  });

  it('a commit of an incomplete word is an incorrect space', () => {
    const s = makeSession({ text: 'cat dog' });
    const commit = s.inputEvents.find((e) => e.op === 'commit')!;
    commit.ci = 2; // pressed space after only "ca"
    const ks = deriveKeystrokes(s);
    expect(ks.find((k) => k.typed === ' ')).toMatchObject({ correct: false, wi: 0, ci: 2 });
  });

  it('turns a gap longer than pauseMs into ikiMs=null but keeps normal ones', () => {
    const ks = deriveKeystrokes(makeSession({ text: 'abc', pauses: [{ wi: 0, ci: 2, ms: 3000 }] }));
    expect(ks[1]!.ikiMs).toBe(150);
    expect(ks[2]!.ikiMs).toBeNull(); // 150 + 3000 > 2000
    expect(deriveKeystrokes(makeSession({ text: 'abc', pauses: [{ wi: 0, ci: 2, ms: 3000 }] }), { pauseMs: 5000 })[2]!.ikiMs).toBe(3150);
  });

  it('holdMs/flightMs are null when the keyup was never seen', () => {
    const s = makeSession({ text: 'ab' });
    s.keyEvents = s.keyEvents.filter((e) => !(e.type === 'up' && e.code === 'KeyA'));
    const ks = deriveKeystrokes(s);
    expect(ks[0]!.holdMs).toBeNull();
    expect(ks[1]!.flightMs).toBeNull();
    expect(ks[1]!.holdMs).toBe(90);
  });

  it('skips ime sessions and empty sessions', () => {
    expect(deriveKeystrokes(makeSession({ text: 'ab', flags: ['ime'] }))).toEqual([]);
    const empty = makeSession({ text: 'ab' });
    empty.inputEvents = [];
    empty.keyEvents = [];
    expect(deriveKeystrokes(empty)).toEqual([]);
  });

  it('numbers keystrokes with idx and carries the session id', () => {
    const ks = deriveKeystrokes(makeSession({ text: 'ab', id: 'sess-9' }));
    expect(ks.map((k) => k.idx)).toEqual([0, 1, 2]);
    expect(ks.every((k) => k.sessionId === 'sess-9')).toBe(true);
  });
});
