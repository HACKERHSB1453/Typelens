/** US QWERTY, standard touch-typing finger assignment. Keys are identified by KeyboardEvent.code. */
import type { FingerId, Hand, Row } from './schema';

export interface KeyInfo {
  /** unshifted character; " " for Space */
  char: string;
  shiftChar: string;
  finger: FingerId;
  hand: Hand;
  row: Row;
}

// [code, char, shiftChar, finger, row]
const TABLE: Array<[string, string, string, FingerId, Row]> = [
  ['Backquote', '`', '~', 'LP', 'number'],
  ['Digit1', '1', '!', 'LP', 'number'],
  ['Digit2', '2', '@', 'LR', 'number'],
  ['Digit3', '3', '#', 'LM', 'number'],
  ['Digit4', '4', '$', 'LI', 'number'],
  ['Digit5', '5', '%', 'LI', 'number'],
  ['Digit6', '6', '^', 'RI', 'number'],
  ['Digit7', '7', '&', 'RI', 'number'],
  ['Digit8', '8', '*', 'RM', 'number'],
  ['Digit9', '9', '(', 'RR', 'number'],
  ['Digit0', '0', ')', 'RP', 'number'],
  ['Minus', '-', '_', 'RP', 'number'],
  ['Equal', '=', '+', 'RP', 'number'],
  ['KeyQ', 'q', 'Q', 'LP', 'top'],
  ['KeyW', 'w', 'W', 'LR', 'top'],
  ['KeyE', 'e', 'E', 'LM', 'top'],
  ['KeyR', 'r', 'R', 'LI', 'top'],
  ['KeyT', 't', 'T', 'LI', 'top'],
  ['KeyY', 'y', 'Y', 'RI', 'top'],
  ['KeyU', 'u', 'U', 'RI', 'top'],
  ['KeyI', 'i', 'I', 'RM', 'top'],
  ['KeyO', 'o', 'O', 'RR', 'top'],
  ['KeyP', 'p', 'P', 'RP', 'top'],
  ['BracketLeft', '[', '{', 'RP', 'top'],
  ['BracketRight', ']', '}', 'RP', 'top'],
  ['Backslash', '\\', '|', 'RP', 'top'],
  ['KeyA', 'a', 'A', 'LP', 'home'],
  ['KeyS', 's', 'S', 'LR', 'home'],
  ['KeyD', 'd', 'D', 'LM', 'home'],
  ['KeyF', 'f', 'F', 'LI', 'home'],
  ['KeyG', 'g', 'G', 'LI', 'home'],
  ['KeyH', 'h', 'H', 'RI', 'home'],
  ['KeyJ', 'j', 'J', 'RI', 'home'],
  ['KeyK', 'k', 'K', 'RM', 'home'],
  ['KeyL', 'l', 'L', 'RR', 'home'],
  ['Semicolon', ';', ':', 'RP', 'home'],
  ['Quote', "'", '"', 'RP', 'home'],
  ['Enter', '\n', '\n', 'RP', 'home'],
  ['KeyZ', 'z', 'Z', 'LP', 'bottom'],
  ['KeyX', 'x', 'X', 'LR', 'bottom'],
  ['KeyC', 'c', 'C', 'LM', 'bottom'],
  ['KeyV', 'v', 'V', 'LI', 'bottom'],
  ['KeyB', 'b', 'B', 'LI', 'bottom'],
  ['KeyN', 'n', 'N', 'RI', 'bottom'],
  ['KeyM', 'm', 'M', 'RI', 'bottom'],
  ['Comma', ',', '<', 'RM', 'bottom'],
  ['Period', '.', '>', 'RR', 'bottom'],
  ['Slash', '/', '?', 'RP', 'bottom'],
  ['Space', ' ', ' ', 'RT', 'space'],
];

export const KEYS: Readonly<Record<string, KeyInfo>> = Object.freeze(
  Object.fromEntries(
    TABLE.map(([code, char, shiftChar, finger, row]) => [code, { char, shiftChar, finger, hand: finger[0] as Hand, row }]),
  ),
);

const CODE_FOR_CHAR: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [code, info] of Object.entries(KEYS)) {
    m.set(info.char, code);
    if (info.shiftChar !== info.char) m.set(info.shiftChar, code); // uppercase letters and shifted symbols share the physical key
  }
  return m;
})();

export function keyInfo(code: string): KeyInfo | undefined {
  return KEYS[code];
}
export function fingerOf(code: string): FingerId | undefined {
  return KEYS[code]?.finger;
}
export function handOf(code: string): Hand | undefined {
  return KEYS[code]?.hand;
}
export function rowOf(code: string): Row | undefined {
  return KEYS[code]?.row;
}
/** Physical key that types `ch` (letters case-insensitively). */
export function codeForChar(ch: string): string | undefined {
  return CODE_FOR_CHAR.get(ch);
}
export function isModifier(code: string): boolean {
  return /^(Shift|Control|Alt|Meta)(Left|Right)$/.test(code) || code === 'CapsLock';
}
/** How a character is shown in the UI: Space becomes "␣". */
export function labelForChar(ch: string): string {
  return ch === ' ' ? '␣' : ch;
}
/** Every key of a finger, by code. */
export function codesForFinger(finger: FingerId): string[] {
  return Object.entries(KEYS)
    .filter(([, k]) => k.finger === finger)
    .map(([c]) => c);
}
