import { describe, expect, it } from 'vitest';
import { KEYS, codeForChar, codesForFinger, fingerOf, handOf, isModifier, keyInfo, labelForChar, rowOf } from '../src/layout';
import { histogram, kogasa, mean, median, mulberry32, percentile, stdDev } from '../src/stats-util';

describe('layout (US QWERTY)', () => {
  it('assigns the standard touch-typing fingers', () => {
    // left hand
    for (const c of ['KeyQ', 'KeyA', 'KeyZ', 'Digit1', 'Backquote']) expect(fingerOf(c)).toBe('LP');
    for (const c of ['KeyW', 'KeyS', 'KeyX', 'Digit2']) expect(fingerOf(c)).toBe('LR');
    for (const c of ['KeyE', 'KeyD', 'KeyC', 'Digit3']) expect(fingerOf(c)).toBe('LM');
    for (const c of ['KeyR', 'KeyF', 'KeyV', 'KeyT', 'KeyG', 'KeyB', 'Digit4', 'Digit5']) expect(fingerOf(c)).toBe('LI');
    // right hand
    for (const c of ['KeyY', 'KeyH', 'KeyN', 'KeyU', 'KeyJ', 'KeyM', 'Digit6', 'Digit7']) expect(fingerOf(c)).toBe('RI');
    for (const c of ['KeyI', 'KeyK', 'Comma', 'Digit8']) expect(fingerOf(c)).toBe('RM');
    for (const c of ['KeyO', 'KeyL', 'Period', 'Digit9']) expect(fingerOf(c)).toBe('RR');
    for (const c of ['KeyP', 'Semicolon', 'Quote', 'Slash', 'BracketLeft', 'Enter', 'Digit0', 'Minus']) expect(fingerOf(c)).toBe('RP');
    expect(fingerOf('Space')).toBe('RT');
    expect(fingerOf('NoSuchKey')).toBeUndefined();
  });

  it('derives hand and row', () => {
    expect(handOf('KeyF')).toBe('L');
    expect(handOf('KeyJ')).toBe('R');
    expect(rowOf('KeyQ')).toBe('top');
    expect(rowOf('KeyA')).toBe('home');
    expect(rowOf('KeyZ')).toBe('bottom');
    expect(rowOf('Digit5')).toBe('number');
    expect(rowOf('Space')).toBe('space');
    expect(Object.values(KEYS).every((k) => k.hand === k.finger[0])).toBe(true);
  });

  it('maps characters back to physical keys (letters case-insensitively, shifted symbols)', () => {
    expect(codeForChar('a')).toBe('KeyA');
    expect(codeForChar('A')).toBe('KeyA');
    expect(codeForChar('!')).toBe('Digit1');
    expect(codeForChar(' ')).toBe('Space');
    expect(codeForChar('é')).toBeUndefined();
    expect(keyInfo('KeyA')?.char).toBe('a');
  });

  it('knows modifiers, display labels and the keys of a finger', () => {
    expect(['ShiftLeft', 'ControlRight', 'AltLeft', 'MetaRight', 'CapsLock'].every(isModifier)).toBe(true);
    expect(isModifier('KeyA')).toBe(false);
    expect(labelForChar(' ')).toBe('␣');
    expect(labelForChar('a')).toBe('a');
    expect(codesForFinger('LM').sort()).toEqual(['Digit3', 'KeyC', 'KeyD', 'KeyE']);
  });
});

describe('stats-util', () => {
  it('mean, median, percentile, stdDev with hand-computed values', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 25)).toBe(20); // rank 1.0
    expect(percentile([10, 20], 50)).toBe(15);
    // population sd of [2,4,4,4,5,5,7,9]: mean 5, squared deviations sum 32, /8 = 4 => 2
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });

  it('returns 0 for empty input, never NaN', () => {
    for (const f of [mean, median, stdDev]) expect(f([])).toBe(0);
    expect(percentile([], 90)).toBe(0);
    expect(histogram([], 20, 100).counts).toEqual([0, 0, 0, 0, 0]);
  });

  it('kogasa maps 0 variation to 100 and large variation towards 0', () => {
    expect(kogasa(0)).toBe(100);
    // cov 0.5: 0.5 + 0.125/3 + 0.03125/5 = 0.5479167; tanh = 0.49913..; => ~50.09
    expect(kogasa(0.5)).toBeCloseTo(100 * (1 - Math.tanh(0.5 + 0.125 / 3 + 0.03125 / 5)), 10);
    expect(kogasa(0.5)).toBeGreaterThan(49);
    expect(kogasa(0.5)).toBeLessThan(52);
    expect(kogasa(3)).toBeLessThan(0.01);
    expect(kogasa(0.1)).toBeGreaterThan(kogasa(0.2));
  });

  it('histogram bins values, sends overflow to the last bin and negatives to the first', () => {
    const h = histogram([0, 19, 20, 99, 100, 5000, -5], 20, 100);
    expect(h.binMs).toBe(20);
    expect(h.counts).toEqual([3, 1, 0, 0, 3]); // [0,19,-5] | [20] | | | [99, 100, 5000]
  });

  it('mulberry32 is deterministic and within [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, a);
    expect(seqA).toEqual(Array.from({ length: 5 }, b));
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(seqA[0]);
  });
});
