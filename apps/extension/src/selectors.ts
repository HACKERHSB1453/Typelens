/**
 * EVERY Monkeytype DOM selector lives here (verified against the live site on 2026-09-20).
 * Monkeytype is mid-migration to SolidJS, so these can rot; healthCheck() lets the popup say so
 * instead of silently recording nothing.
 */
export const SEL = {
  /** hidden <textarea> that receives all typing */
  wordsInput: '#wordsInput',
  words: '#words',
  word: '#words .word',
  activeWord: '#words .word.active',
  /** result screen; gets/loses the `hidden` class */
  result: '#result',
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

/** Selectors whose absence means recording cannot work at all. */
const REQUIRED: ReadonlyArray<keyof typeof SEL> = ['wordsInput', 'words', 'result'];

export interface Health {
  ok: boolean;
  missing: string[];
}

export function healthCheck(doc: Document): Health {
  const missing = REQUIRED.filter((k) => !doc.querySelector(SEL[k])).map((k) => SEL[k] as string);
  return { ok: missing.length === 0, missing };
}
