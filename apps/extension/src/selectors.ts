/**
 * EVERY Monkeytype DOM selector lives here (verified against the live site on 2026-09-20; result screen
 * re-verified on 2026-10-10).
 * Monkeytype is mid-migration to SolidJS, so these can rot; healthCheck() lets the popup say so
 * instead of silently recording nothing.
 */
export const SEL = {
  /** hidden <textarea> that receives all typing */
  wordsInput: '#wordsInput',
  words: '#words',
  word: '#words .word',
  activeWord: '#words .word.active',
  /**
   * result screen. Older Monkeytype kept it in the page and toggled a `hidden` class; the SolidJS version
   * (2026-10) only mounts it when a test ends, so it is NOT present while typing.
   */
  result: '#result',
  /** SolidJS result screen: one block per stat (label text + a value element) */
  resultStat: '#result [data-ui-element="resultStat"]',
  resultStatValue: '[data-ui-element="resultStatValue"]',
  /** legacy result screen (before 2026-10) */
  resultWpm: '#result .group.wpm .bottom',
  resultRaw: '#result .group.raw .bottom',
  resultAcc: '#result .group.acc .bottom',
  resultConsistency: '#result .group.consistency .bottom',
  resultChars: '#result .group.key .bottom',
  resultTime: '#result .group.time .bottom',
  /** newer Monkeytype puts the duration in a nested .text (afk/session info are siblings) */
  resultTimeText: '#result .group.time .bottom .text',
  resultInfo: '#result .group.info .bottom',
} as const;

/**
 * Selectors whose absence means recording cannot work at all. `#result` is not one of them: the current
 * Monkeytype only adds it when a test finishes.
 */
const REQUIRED: ReadonlyArray<keyof typeof SEL> = ['wordsInput', 'words'];

export interface Health {
  ok: boolean;
  missing: string[];
}

export function healthCheck(doc: Document): Health {
  const missing = REQUIRED.filter((k) => !doc.querySelector(SEL[k])).map((k) => SEL[k] as string);
  return { ok: missing.length === 0, missing };
}
