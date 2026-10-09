/**
 * Pure recording state machine. No DOM, no chrome.* — everything time-related is passed in,
 * so the whole thing is unit-testable. The DOM glue (content/capture.ts) feeds it events.
 *
 * All input `t` values are event.timeStamp (ms, high-res). Stored `t` values are rebased so 0 is the
 * keydown of the first accepted character, rounded to 0.1 ms.
 */
import type {
  InputEvent,
  KeyEvent,
  MonkeytypeResult,
  Session,
  SessionConfig,
  SessionFlag,
} from '@typelens/core/schema';

export interface RecorderDeps {
  /** epoch ms */
  now(): number;
  uuid(): string;
  extVersion: string;
}

export interface KeyDownInput {
  code: string;
  key: string;
  t: number;
  repeat: boolean;
  isComposing: boolean;
}
export interface KeyUpInput {
  code: string;
  key: string;
  t: number;
}
export interface InputInput {
  inputType: string;
  data: string | null;
  isComposing: boolean;
  t: number;
}
/** Position information the DOM glue reads from Monkeytype BEFORE Monkeytype handles the edit. */
export interface InputCtx {
  wi: number;
  ci: number;
  expectedChar: string;
}
export interface WordEntry {
  wi: number;
  text: string;
}

/** A keydown is paired with the input event it produced if they are this close (ms). */
const PAIR_WINDOW_MS = 250;
/** Sessions shorter than this many typed characters are noise (a stray key press). */
export const MIN_INPUTS = 5;
const PRE_BUFFER_MAX = 8;
const WORD_LOOKAHEAD = 10;

interface DownRef {
  code: string;
  key: string;
  t: number;
}

function isRecordedKey(key: string): boolean {
  // printable characters (incl. " "), Backspace and Enter. Modifiers, arrows, F-keys are dropped.
  return key.length === 1 || key === 'Backspace' || key === 'Enter';
}

export class Recorder {
  private cfg: SessionConfig | null = null;
  private wordMap = new Map<number, string>();

  private active = false;
  private id = '';
  private startedAt = 0;
  private t0 = 0;
  private flags = new Set<SessionFlag>();
  private keys: KeyEvent[] = [];
  private inputs: InputEvent[] = [];
  private typed = 0; // count of accepted 'ins' events
  private maxWi = 0;

  /** key events seen before the session started (the first char's keydown arrives before its input event) */
  private pre: KeyEvent[] = [];
  private open = new Set<string>();
  private lastDown: DownRef | null = null;

  constructor(private readonly deps: RecorderDeps) {}

  onTestConfig(cfg: SessionConfig): void {
    this.cfg = cfg;
  }

  /**
   * Target words from the DOM. While no test is running they simply replace the known words.
   * During a test they are merged by word index; if an already-known index now shows a DIFFERENT
   * word, Monkeytype regenerated the wordset (a restart) — the in-progress session is flushed as
   * incomplete and returned.
   */
  onWords(words: WordEntry[]): Session | null {
    if (!this.active) {
      this.wordMap = new Map(words.map((w) => [w.wi, w.text]));
      return null;
    }
    // A restart regenerates (nearly) every word. Monkeytype's "replace typos" option rewrites only
    // the few letters you got wrong, so require a clear majority of overlapping words to differ.
    let overlap = 0;
    let differing = 0;
    for (const w of words) {
      const known = this.wordMap.get(w.wi);
      if (known === undefined) continue;
      overlap++;
      if (known !== w.text) differing++;
    }
    if (overlap >= 3 && differing / overlap > 0.5) {
      const flushed = this.finish(false, undefined, 'restart');
      this.wordMap = new Map(words.map((w) => [w.wi, w.text]));
      return flushed;
    }
    // first-seen text wins: never overwrite a known word with a later (possibly typo-marked) rendering
    for (const w of words) if (!this.wordMap.has(w.wi)) this.wordMap.set(w.wi, w.text);
    return null;
  }

  onKeyDown(e: KeyDownInput): void {
    if (e.repeat) return;
    if (e.isComposing || e.key === 'Dead' || e.key === 'Process') {
      if (this.active) this.flags.add('ime');
      return;
    }
    if (!isRecordedKey(e.key)) return;
    const ev: KeyEvent = { t: e.t, type: 'down', code: e.code, key: e.key };
    this.lastDown = { code: e.code, key: e.key, t: e.t };
    this.open.add(e.code);
    this.push(ev);
  }

  onKeyUp(e: KeyUpInput): void {
    if (!this.open.has(e.code)) return; // a key we never saw go down (e.g. pressed before load)
    this.open.delete(e.code);
    this.push({ t: e.t, type: 'up', code: e.code, key: e.key });
  }

  onInput(e: InputInput, ctx: InputCtx): void {
    if (e.isComposing) {
      if (this.active) this.flags.add('ime');
      return;
    }
    const data = e.data ?? '';
    let op: InputEvent['op'] | null = null;
    if (e.inputType === 'insertText' && data === ' ') op = 'commit';
    else if (e.inputType === 'insertText' && data.length === 1) op = 'ins';
    else if (e.inputType === 'deleteContentBackward') op = 'del';
    else if (e.inputType === 'deleteWordBackward') op = 'wdel';
    if (op === null) return; // pastes, multi-character inserts, anything unexpected

    const down = this.lastDown && Math.abs(e.t - this.lastDown.t) <= PAIR_WINDOW_MS ? this.lastDown : null;
    const t = down ? down.t : e.t;

    if (!this.active) {
      if (op !== 'ins' || !this.cfg || this.wordMap.size === 0) return;
      this.start(t);
    }

    const ev: InputEvent = { t, op, wi: ctx.wi, ci: ctx.ci };
    if (down) ev.code = down.code;
    if (op === 'ins') {
      ev.typed = data;
      ev.expected = ctx.expectedChar;
      ev.correct = data === ctx.expectedChar;
      this.typed++;
    }
    if (ctx.wi > this.maxWi) this.maxWi = ctx.wi;
    this.inputs.push(ev);
  }

  /** Called when the test restarts. Returns the incomplete session if enough was typed. */
  onRestart(): Session | null {
    if (!this.active) return null;
    return this.finish(false, undefined, 'restart');
  }

  onBlur(): void {
    if (this.active) this.flags.add('blur');
  }

  /** The result screen appeared. Returns the finished session (null if it was too short/not started). */
  onResult(result: MonkeytypeResult, completed = true): Session | null {
    if (!this.active) return null;
    return this.finish(completed, result);
  }

  snapshot(): { active: boolean; inputs: number; maxWi: number } {
    return { active: this.active, inputs: this.typed, maxWi: this.maxWi };
  }

  /** The stable (first-seen) target text of a word, for the DOM glue to derive expected characters. */
  targetWord(wi: number): string | undefined {
    return this.wordMap.get(wi);
  }

  // ---------------------------------------------------------------------------

  private push(ev: KeyEvent): void {
    if (this.active) {
      this.keys.push(ev);
      return;
    }
    this.pre.push(ev);
    if (this.pre.length > PRE_BUFFER_MAX) this.pre.shift();
  }

  private start(t0: number): void {
    this.active = true;
    this.id = this.deps.uuid();
    this.startedAt = this.deps.now();
    this.t0 = t0;
    this.flags = new Set();
    // keep the first character's own keydown (and anything after it) from the pre-buffer
    this.keys = this.pre.filter((k) => k.t >= t0);
    this.pre = [];
    this.inputs = [];
    this.typed = 0;
    this.maxWi = 0;
  }

  private rel(t: number): number {
    return Math.round((t - this.t0) * 10) / 10;
  }

  private finish(completed: boolean, result?: MonkeytypeResult, extraFlag?: SessionFlag): Session | null {
    const enough = this.typed >= MIN_INPUTS && this.cfg !== null;
    let session: Session | null = null;
    if (enough && this.cfg) {
      const flags = new Set(this.flags);
      if (extraFlag) flags.add(extraFlag);
      const words: string[] = [];
      const last = this.maxWi + WORD_LOOKAHEAD;
      for (let i = 0; i <= last; i++) words.push(this.wordMap.get(i) ?? '');
      while (words.length && words[words.length - 1] === '') words.pop();
      session = {
        v: 1,
        id: this.id,
        startedAt: this.startedAt,
        source: 'monkeytype',
        config: this.cfg,
        words,
        keyEvents: this.keys.map((k) => ({ ...k, t: this.rel(k.t) })),
        inputEvents: this.inputs.map((i) => ({ ...i, t: this.rel(i.t) })),
        completed,
        flags: [...flags],
        client: { extVersion: this.deps.extVersion },
      };
      if (result) session.result = result;
    }
    this.resetRun();
    return session;
  }

  private resetRun(): void {
    this.active = false;
    this.keys = [];
    this.inputs = [];
    this.flags = new Set();
    this.typed = 0;
    this.maxWi = 0;
    this.pre = [];
    this.open.clear();
    this.lastDown = null;
    this.wordMap = new Map();
  }
}
