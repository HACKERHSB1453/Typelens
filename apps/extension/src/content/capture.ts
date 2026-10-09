/**
 * DOM glue for monkeytype.com. PASSIVE by construction:
 *   - listeners are capture-phase + passive and never call preventDefault/stopPropagation;
 *   - only events whose target is #wordsInput are looked at (login box, search, command line,
 *     custom-text editor etc. are never recorded);
 *   - nothing is written to the page and nothing is sent to monkeytype.com.
 * Everything is wrapped so an error here can never reach the page.
 */
import type { MonkeytypeResult, Session, SessionConfig } from '@typelens/core/schema';
import { Recorder, type WordEntry } from '../recorder';
import { healthCheck, SEL, type Health } from '../selectors';

export interface CaptureEnv {
  doc: Document;
  win: Window & typeof globalThis;
  recorder: Recorder;
  /** a finished (or flushed-incomplete) session */
  send(session: Session): void;
  isPaused(): boolean;
  /** raw JSON string of Monkeytype's `config` localStorage entry, or null */
  readConfigJson(): string | null;
  reportHealth?(h: Health): void;
}

// ------------------------------------------------------------------ pure DOM readers (exported for tests)

export function toSessionConfig(json: string | null): SessionConfig | null {
  if (!json) return null;
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  const mode = String(c.mode ?? 'time') as SessionConfig['mode'];
  let mode2 = mode as string;
  if (mode === 'time') mode2 = String(c.time ?? '');
  else if (mode === 'words') mode2 = String(c.words ?? '');
  else if (mode === 'quote') mode2 = Array.isArray(c.quoteLength) ? c.quoteLength.join('-') : String(c.quoteLength ?? '');
  let funbox: string[] = [];
  if (Array.isArray(c.funbox)) funbox = c.funbox.map(String);
  else if (typeof c.funbox === 'string') funbox = c.funbox.split('#').filter((f) => f && f !== 'none');
  const cfg: SessionConfig = {
    mode,
    mode2,
    language: String(c.language ?? 'english'),
    punctuation: c.punctuation === true,
    numbers: c.numbers === true,
    funbox,
  };
  if (c.difficulty === 'normal' || c.difficulty === 'expert' || c.difficulty === 'master') cfg.difficulty = c.difficulty;
  return cfg;
}

/** Target text of one rendered word: its letters except the `extra` ones typed beyond the end. */
function wordText(el: Element): string {
  let s = '';
  for (const l of Array.from(el.children)) if (!l.classList.contains('extra')) s += l.textContent ?? '';
  return s;
}

export function readWords(doc: Document): WordEntry[] {
  const out: WordEntry[] = [];
  for (const el of Array.from(doc.querySelectorAll(SEL.word))) {
    const wi = Number((el as HTMLElement).dataset.wordindex);
    if (Number.isFinite(wi)) out.push({ wi, text: wordText(el) });
  }
  return out;
}

/** True when the mutations added a `.word` element with data-wordindex="0". */
function rebuiltWordZero(mutations: MutationRecord[]): boolean {
  for (const m of mutations) {
    for (const n of Array.from(m.addedNodes)) {
      if (n.nodeType !== 1) continue;
      const el = n as HTMLElement;
      if (el.classList.contains('word') && el.dataset.wordindex === '0') return true;
      if (el.querySelector?.('.word[data-wordindex="0"]')) return true;
    }
  }
  return false;
}

/** First number in a string ("97.84%" -> 97.84, "1,234" -> 1234). */
function firstNumber(s: string | null | undefined): number {
  const m = (s ?? '').replace(/(\d),(\d{3})/g, '$1$2').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : Number.NaN;
}

/**
 * wpm / raw. The number SHOWN is in the user's typing-speed unit (wpm, cpm, ...); Monkeytype puts the precise
 * value "123.45 wpm" in aria-label only with some settings. Prefer an aria-label that says wpm, else what is shown.
 */
function readSpeed(el: Element | null): number {
  const aria = el?.getAttribute('aria-label') ?? '';
  if (/wpm\s*$/i.test(aria.trim())) return firstNumber(aria);
  return firstNumber(el?.textContent);
}

/**
 * acc / consistency: what is SHOWN is the value. Their aria-labels hold other things (acc at 100%: only
 * "45 correct / 0 incorrect"; consistency: the KEY consistency), so an aria number is only used when it is a
 * percentage that agrees with the shown one and merely adds precision.
 */
function readPercent(el: Element | null): number {
  const shown = firstNumber(el?.textContent);
  const aria = el?.getAttribute('aria-label') ?? '';
  // older format: "72.5% (60% key)" (the part before the parenthesis is the value); newer: "60% key" (key consistency only)
  const main = (aria.split('\n')[0] ?? '').split('(')[0] ?? '';
  const precise = /%/.test(main) && !/key/i.test(main) ? firstNumber(main) : Number.NaN;
  return Number.isFinite(precise) && Number.isFinite(shown) && Math.abs(precise - shown) < 1 ? precise : shown;
}

/** "4.03s", "65s", "1:05", "1m 5s", "2h 1m 3s" -> seconds. */
export function parseDuration(text: string): number {
  const t = text.trim();
  const colon = t.match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/);
  if (colon) return Number(colon[1] ?? 0) * 3600 + Number(colon[2]) * 60 + Number(colon[3]);
  const h = t.match(/(\d+(?:\.\d+)?)\s*h/);
  const m = t.match(/(\d+(?:\.\d+)?)\s*m(?!s)/);
  const s = t.match(/(\d+(?:\.\d+)?)\s*s/);
  if (h || m) return Number(h?.[1] ?? 0) * 3600 + Number(m?.[1] ?? 0) * 60 + Number(s?.[1] ?? 0);
  return firstNumber(t);
}

/**
 * Reads the result screen. Checked against Monkeytype's source (frontend/src/ts/test/result.ts) and a real result
 * with "always show decimal places" on: the shown text is the reliable value; aria-labels vary by setting.
 */
export function parseResult(doc: Document): { result: MonkeytypeResult; failed: boolean } | null {
  const q = (sel: string) => doc.querySelector(sel);
  const wpm = readSpeed(q(SEL.resultWpm));
  const acc = readPercent(q(SEL.resultAcc));
  if (!Number.isFinite(wpm) || !Number.isFinite(acc)) return null;
  const raw = readSpeed(q(SEL.resultRaw));
  const cons = readPercent(q(SEL.resultConsistency));
  const timeEl = q(SEL.resultTimeText) ?? q(SEL.resultTime);
  const dur = parseDuration(timeEl?.textContent ?? '');
  const result: MonkeytypeResult = {
    wpm,
    rawWpm: Number.isFinite(raw) ? raw : wpm,
    acc,
    consistency: Number.isFinite(cons) ? cons : 0,
    testDurationSec: Number.isFinite(dur) ? dur : 0,
  };
  const chars = (q(SEL.resultChars)?.textContent ?? '').split('/').map((x) => parseInt(x, 10));
  if (chars.length === 4 && chars.every((n) => Number.isFinite(n))) {
    result.charStats = chars as [number, number, number, number];
  }
  const info = (q(SEL.resultInfo)?.textContent ?? '').toLowerCase();
  return { result, failed: info.includes('failed') || info.includes('invalid') };
}
// ------------------------------------------------------------------ wiring

export function attachCapture(env: CaptureEnv): { detach(): void; syncWords(): void } {
  const { doc, win, recorder } = env;
  const cleanups: Array<() => void> = [];
  let resultShown = false;

  const safe =
    <A extends unknown[]>(fn: (...a: A) => void) =>
    (...a: A): void => {
      try {
        fn(...a);
      } catch (err) {
        console.debug('[typelens] ignored error', err);
      }
    };

  const isWordsInput = (t: EventTarget | null): t is HTMLTextAreaElement =>
    !!t && (t as HTMLElement).id === 'wordsInput' && (t as HTMLElement).tagName === 'TEXTAREA';

  const emit = (s: Session | null): void => {
    if (s) env.send(s);
  };

  const syncWords = safe(() => {
    const words = readWords(doc);
    if (words.length) emit(recorder.onWords(words));
  });

  /** Before a test starts, make sure the recorder knows the config + words. */
  const refreshContext = (): void => {
    const cfg = toSessionConfig(env.readConfigJson());
    if (cfg) recorder.onTestConfig(cfg);
    syncWords();
  };

  const onKeyDown = safe((e: KeyboardEvent) => {
    if (!isWordsInput(e.target) || env.isPaused()) return;
    if (!recorder.snapshot().active) refreshContext();
    recorder.onKeyDown({ code: e.code, key: e.key, t: e.timeStamp, repeat: e.repeat, isComposing: e.isComposing });
  });

  const onKeyUp = safe((e: KeyboardEvent) => {
    if (!isWordsInput(e.target) || env.isPaused()) return;
    recorder.onKeyUp({ code: e.code, key: e.key, t: e.timeStamp });
  });

  // The current word index is tracked HERE from the input stream, not read from Monkeytype's DOM.
  // Monkeytype paints `.word.active` lazily, so in a throttled/backgrounded tab (or for a very fast
  // typist) the DOM lags behind and every later word would be compared against word 0. The textarea,
  // by contrast, is updated synchronously (verified on the live site: it holds " " + the typed word).
  let curWi = 0;
  const typedByWi = new Map<number, string>();

  const onInput = safe((e: Event) => {
    const ta = e.target;
    if (!isWordsInput(ta) || env.isPaused()) return;
    const ie = e as InputEvent;
    // At capture time the textarea already holds the NEW text (a leading space + the typed word).
    const raw = ta.value;
    const value = raw.startsWith(' ') ? raw.slice(1) : raw;
    const isIns = ie.inputType === 'insertText' && typeof ie.data === 'string' && ie.data.length === 1 && ie.data !== ' ';
    const isCommit = ie.inputType === 'insertText' && ie.data === ' ';
    const isDel = ie.inputType === 'deleteContentBackward' || ie.inputType === 'deleteWordBackward';

    if (!recorder.snapshot().active) {
      // A session can only start on the very first character of word 0 of a fresh test.
      if (!(isIns && value.length === 1)) return;
      curWi = 0;
      typedByWi.clear();
    }

    let wi = curWi;
    let ci = 0;
    let expectedChar = '';
    if (isCommit) {
      const typed = value.endsWith(' ') ? value.slice(0, -1) : value;
      ci = typed.length; // characters typed in the word being committed
      typedByWi.set(wi, typed);
    } else if (isIns) {
      ci = Math.max(0, value.length - 1);
      expectedChar = recorder.targetWord(wi)?.[ci] ?? '';
    } else if (isDel) {
      if (raw === '') {
        // the leading space itself was deleted: Backspace crossed back into the previous word
        wi = Math.max(0, curWi - 1);
        ci = (typedByWi.get(wi) ?? '').length; // position of the space that got un-committed
      } else if (ie.inputType === 'deleteWordBackward') {
        ci = 0;
      } else {
        ci = value.length; // index of the character that was removed
      }
    }

    recorder.onInput({ inputType: ie.inputType, data: ie.data, isComposing: ie.isComposing, t: e.timeStamp }, { wi, ci, expectedChar });

    // advance the tracked word AFTER recording, so the commit itself belongs to the word it finished
    if (isCommit) curWi = wi + 1;
    else if (isDel && raw === '') curWi = wi;
  });

  const onBlur = safe(() => recorder.onBlur());

  const listen = (type: string, fn: (e: never) => void): void => {
    doc.addEventListener(type, fn as EventListener, { capture: true, passive: true });
    cleanups.push(() => doc.removeEventListener(type, fn as EventListener, { capture: true }));
  };
  listen('keydown', onKeyDown);
  listen('keyup', onKeyUp);
  listen('input', onInput);
  win.addEventListener('blur', onBlur, { passive: true });
  cleanups.push(() => win.removeEventListener('blur', onBlur));

  // ---- result screen: `hidden` class removed => test finished
  const checkResult = safe(() => {
    const el = doc.querySelector(SEL.result);
    if (!el) return;
    const visible = !el.classList.contains('hidden');
    if (visible && !resultShown) {
      resultShown = true;
      if (env.isPaused() || !recorder.snapshot().active) return;
      const parsed = parseResult(doc);
      if (parsed) emit(recorder.onResult(parsed.result, !parsed.failed));
      else emit(recorder.onRestart()); // result screen without numbers: keep the data, mark incomplete
    } else if (!visible) {
      resultShown = false;
    }
  });

  // ---- observers. Monkeytype re-renders parts of the page, so re-attach when the element changes.
  let observed: { result: Element | null; words: Element | null } = { result: null, words: null };
  let resultObs: MutationObserver | null = null;
  let wordsObs: MutationObserver | null = null;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  const attachObservers = safe(() => {
    const result = doc.querySelector(SEL.result);
    const words = doc.querySelector(SEL.words);
    if (result && result !== observed.result) {
      resultObs?.disconnect();
      const ro = new win.MutationObserver(checkResult);
      ro.observe(result, { attributes: true, attributeFilter: ['class'] });
      resultObs = ro;
      observed.result = result;
    }
    if (words && words !== observed.words) {
      wordsObs?.disconnect();
      const wo = new win.MutationObserver((mutations) => {
        // A restart (including "repeat test", which reuses the SAME words) rebuilds the word list, so a
        // fresh word 0 element is added. While typing, Monkeytype only appends later words and removes
        // scrolled-out early ones - it never re-adds word 0.
        if (recorder.snapshot().active && rebuiltWordZero(mutations)) emit(recorder.onRestart());
        clearTimeout(debounce);
        debounce = setTimeout(syncWords, 200);
      });
      wo.observe(words, { childList: true });
      wordsObs = wo;
      observed.words = words;
    }
    env.reportHealth?.(healthCheck(doc));
  });

  attachObservers();
  const timer = setInterval(attachObservers, 2000);
  cleanups.push(() => {
    clearInterval(timer);
    clearTimeout(debounce);
    resultObs?.disconnect();
    wordsObs?.disconnect();
  });

  return {
    detach: () => cleanups.forEach((c) => c()),
    syncWords,
  };
}
