import { describe, expect, it } from 'vitest';
import { KEYS } from '@typelens/core';
import { KEY_DEFS } from '../src/data/keymap';

// The on-screen keyboard (keymap.ts) and the analysis (core layout.ts) must agree, or heatmaps colour keys by the wrong finger.
describe('keymap vs core layout', () => {
  it('assigns every key to the same finger', () => {
    const diffs = KEY_DEFS.filter((d) => KEYS[d.code] && KEYS[d.code]!.finger !== d.finger).map((d) => `${d.code}: keymap ${d.finger} / core ${KEYS[d.code]!.finger}`);
    expect(diffs).toEqual([]);
  });

  it('draws every key the analysis knows about', () => {
    const drawn = new Set(KEY_DEFS.map((d) => d.code));
    // Enter never occurs inside a Monkeytype test, so the drawn keyboard may leave it out
    expect(Object.keys(KEYS).filter((c) => !drawn.has(c) && c !== 'Enter')).toEqual([]);
  });
});
