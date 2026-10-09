import type { FingerId, Hand, Row } from './types';

/* ============================================================================
 * QWERTY keyboard model.
 * Maps KeyboardEvent.code -> { char, finger, hand, row } for touch typing,
 * and provides a coordinate layout for rendering an SVG heatmap keyboard.
 * ------------------------------------------------------------------------- */

export interface KeyDef {
  /** KeyboardEvent.code, e.g. "KeyA" */
  code: string;
  /** Lowercase character produced (for Space this is ' '). */
  char: string;
  /** What to render on the keycap. */
  label: string;
  finger: FingerId;
  hand: Hand;
  row: Row;
  /** Grid column offset (in key units) for staggered rows. */
  col: number;
  /** Row index, 0 = number row .. 4 = space. */
  rowIdx: number;
  /** Width in key units (1 = standard). */
  w: number;
}

// Standard touch-typing finger assignment.
// Left: LP=pinky, LR=ring, LM=middle, LI=index, LT=thumb
// Right: RT=thumb, RI=index, RM=middle, RR=ring, RP=pinky
const F = {
  LP: { finger: 'LP' as FingerId, hand: 'L' as Hand },
  LR: { finger: 'LR' as FingerId, hand: 'L' as Hand },
  LM: { finger: 'LM' as FingerId, hand: 'L' as Hand },
  LI: { finger: 'LI' as FingerId, hand: 'L' as Hand },
  RT: { finger: 'RT' as FingerId, hand: 'R' as Hand },
  RI: { finger: 'RI' as FingerId, hand: 'R' as Hand },
  RM: { finger: 'RM' as FingerId, hand: 'R' as Hand },
  RR: { finger: 'RR' as FingerId, hand: 'R' as Hand },
  RP: { finger: 'RP' as FingerId, hand: 'R' as Hand },
};

// Helper to build a KeyDef row.
function row(
  rowIdx: number,
  rowId: Row,
  stagger: number,
  items: Array<{ code: string; char: string; label: string; f: typeof F.LP; w?: number }>,
): KeyDef[] {
  let col = stagger;
  const out: KeyDef[] = [];
  for (const it of items) {
    out.push({
      code: it.code,
      char: it.char,
      label: it.label,
      finger: it.f.finger,
      hand: it.f.hand,
      row: rowId,
      col,
      rowIdx,
      w: it.w ?? 1,
    });
    col += it.w ?? 1;
  }
  return out;
}

// clang-format off — keep rows readable.
const NUMBER_ROW = row(0, 'number', 0, [
  { code: 'Backquote', char: '`', label: '`', f: F.LP },
  { code: 'Digit1', char: '1', label: '1', f: F.LP },
  { code: 'Digit2', char: '2', label: '2', f: F.LR },
  { code: 'Digit3', char: '3', label: '3', f: F.LM },
  { code: 'Digit4', char: '4', label: '4', f: F.LI },
  { code: 'Digit5', char: '5', label: '5', f: F.LI },
  { code: 'Digit6', char: '6', label: '6', f: F.RI },
  { code: 'Digit7', char: '7', label: '7', f: F.RI },
  { code: 'Digit8', char: '8', label: '8', f: F.RM },
  { code: 'Digit9', char: '9', label: '9', f: F.RR },
  { code: 'Digit0', char: '0', label: '0', f: F.RP },
  { code: 'Minus', char: '-', label: '-', f: F.RP },
  { code: 'Equal', char: '=', label: '=', f: F.RP },
]);

const TOP_ROW = row(1, 'top', 0.5, [
  { code: 'KeyQ', char: 'q', label: 'q', f: F.LP },
  { code: 'KeyW', char: 'w', label: 'w', f: F.LR },
  { code: 'KeyE', char: 'e', label: 'e', f: F.LM },
  { code: 'KeyR', char: 'r', label: 'r', f: F.LI },
  { code: 'KeyT', char: 't', label: 't', f: F.LI },
  { code: 'KeyY', char: 'y', label: 'y', f: F.RI },
  { code: 'KeyU', char: 'u', label: 'u', f: F.RI },
  { code: 'KeyI', char: 'i', label: 'i', f: F.RM },
  { code: 'KeyO', char: 'o', label: 'o', f: F.RR },
  { code: 'KeyP', char: 'p', label: 'p', f: F.RP },
  { code: 'BracketLeft', char: '[', label: '[', f: F.RP },
  { code: 'BracketRight', char: ']', label: ']', f: F.RP },
  { code: 'Backslash', char: '\\', label: '\\', f: F.RP },
]);

const HOME_ROW = row(2, 'home', 0.75, [
  { code: 'KeyA', char: 'a', label: 'a', f: F.LP },
  { code: 'KeyS', char: 's', label: 's', f: F.LR },
  { code: 'KeyD', char: 'd', label: 'd', f: F.LM },
  { code: 'KeyF', char: 'f', label: 'f', f: F.LI },
  { code: 'KeyG', char: 'g', label: 'g', f: F.LI },
  { code: 'KeyH', char: 'h', label: 'h', f: F.RI },
  { code: 'KeyJ', char: 'j', label: 'j', f: F.RI },
  { code: 'KeyK', char: 'k', label: 'k', f: F.RM },
  { code: 'KeyL', char: 'l', label: 'l', f: F.RR },
  { code: 'Semicolon', char: ';', label: ';', f: F.RP },
  { code: 'Quote', char: "'", label: "'", f: F.RP },
]);

const BOTTOM_ROW = row(3, 'bottom', 1.25, [
  { code: 'KeyZ', char: 'z', label: 'z', f: F.LP },
  { code: 'KeyX', char: 'x', label: 'x', f: F.LR },
  { code: 'KeyC', char: 'c', label: 'c', f: F.LM },
  { code: 'KeyV', char: 'v', label: 'v', f: F.LI },
  { code: 'KeyB', char: 'b', label: 'b', f: F.LI },
  { code: 'KeyN', char: 'n', label: 'n', f: F.RI },
  { code: 'KeyM', char: 'm', label: 'm', f: F.RI },
  { code: 'Comma', char: ',', label: ',', f: F.RM },
  { code: 'Period', char: '.', label: '.', f: F.RR },
  { code: 'Slash', char: '/', label: '/', f: F.RP },
]);

// Space bar spans most of the bottom. The analysis (core layout.ts) attributes it to the right thumb.
const SPACE_ROW: KeyDef[] = [
  {
    code: 'Space',
    char: ' ',
    label: 'space',
    finger: 'RT',
    hand: 'R',
    row: 'space',
    col: 2.25,
    rowIdx: 4,
    w: 8,
  },
];

export const KEY_DEFS: KeyDef[] = [
  ...NUMBER_ROW,
  ...TOP_ROW,
  ...HOME_ROW,
  ...BOTTOM_ROW,
  ...SPACE_ROW,
];

/** Quick lookup: code -> KeyDef. */
export const KEY_BY_CODE: Record<string, KeyDef> = Object.fromEntries(
  KEY_DEFS.map((k) => [k.code, k]),
);

/** Quick lookup: lowercase char -> first matching KeyDef (letters/digits/punct). */
export const KEY_BY_CHAR: Record<string, KeyDef> = (() => {
  const m: Record<string, KeyDef> = {};
  for (const k of KEY_DEFS) {
    if (k.char && !(k.char in m)) m[k.char] = k;
  }
  return m;
})();

/** Finger info for display (name, hand, color hint). */
export const FINGER_INFO: Record<FingerId, { name: string; hand: Hand }> = {
  LP: { name: 'Left pinky', hand: 'L' },
  LR: { name: 'Left ring', hand: 'L' },
  LM: { name: 'Left middle', hand: 'L' },
  LI: { name: 'Left index', hand: 'L' },
  LT: { name: 'Left thumb', hand: 'L' },
  RT: { name: 'Right thumb', hand: 'R' },
  RI: { name: 'Right index', hand: 'R' },
  RM: { name: 'Right middle', hand: 'R' },
  RR: { name: 'Right ring', hand: 'R' },
  RP: { name: 'Right pinky', hand: 'R' },
};

/** All ten fingers in left-to-right order. */
export const ALL_FINGERS: FingerId[] = ['LP', 'LR', 'LM', 'LI', 'LT', 'RT', 'RI', 'RM', 'RR', 'RP'];

/** Get the physical-adjacent (confusable) chars for a given char — used by the mock
 *  generator to produce realistic adjacent-key mistakes. */
export function adjacentChars(char: string): string[] {
  const def = KEY_BY_CHAR[char];
  if (!def) return [];
  const out: string[] = [];
  for (const k of KEY_DEFS) {
    if (k.code === def.code) continue;
    // same row neighbours +/- 1 column, or one row up/down within +/-1 column
    const dRow = Math.abs(k.rowIdx - def.rowIdx);
    const dCol = Math.abs(k.col - def.col);
    if (dRow === 0 && dCol > 0 && dCol <= 1.5) out.push(k.char);
    else if (dRow === 1 && dCol <= 1.25) out.push(k.char);
  }
  return out;
}

/** Determine which thumb (LT or RT) hits space, given the previous typed char's hand.
 *  Common technique: opposite thumb to allow rollover. Defaults to RT. */
export function thumbForPrev(prev: string | null): FingerId {
  const d = prev ? KEY_BY_CHAR[prev] : undefined;
  if (!d) return 'RT';
  return d.hand === 'L' ? 'RT' : 'LT';
}
