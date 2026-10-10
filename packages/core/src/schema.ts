/**
 * TypeLens data contract — the single source of truth shared by:
 *   - apps/extension  (captures Session objects on monkeytype.com)
 *   - packages/core   (derives keystrokes + computes Analysis from Sessions)
 *   - apps/web        (renders Analysis; talks to data ONLY through DataSource)
 *
 * Time convention: every `t` is milliseconds since the session's first accepted input,
 * measured with event.timeStamp (high-res), rounded to 0.1 ms.
 */

export const SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Keyboard model (US QWERTY, standard touch-typing finger assignment)
// ---------------------------------------------------------------------------
/** L/R + P(inky) R(ing) M(iddle) I(ndex) T(humb). Thumbs handle Space. */
export type FingerId = 'LP' | 'LR' | 'LM' | 'LI' | 'LT' | 'RT' | 'RI' | 'RM' | 'RR' | 'RP';
export type Hand = 'L' | 'R';
export type Row = 'number' | 'top' | 'home' | 'bottom' | 'space';

// ---------------------------------------------------------------------------
// Raw capture — what the extension stores per typing test
// ---------------------------------------------------------------------------
/** One physical key event (keydown / keyup). `event.repeat` events are never stored. */
export interface KeyEvent {
  t: number;
  type: 'down' | 'up';
  /** KeyboardEvent.code, e.g. "KeyA", "Space", "Backspace", "ShiftLeft" */
  code: string;
  /** KeyboardEvent.key, e.g. "a", "A", " ", "Backspace" */
  key: string;
}

/** One logical edit of the Monkeytype word box, in order. */
export interface InputEvent {
  /** time of the keydown that produced this edit */
  t: number;
  /** ins = character typed, del = backspace, wdel = delete previous word, commit = space pressed to finish a word */
  op: 'ins' | 'del' | 'wdel' | 'commit';
  /** word index (Monkeytype data-wordindex) */
  wi: number;
  /** character index within the word the edit applies to */
  ci: number;
  /** ins: the character that was typed */
  typed?: string;
  /** ins: the character the test expected at this position ("" when this is an extra character) */
  expected?: string;
  /** ins: typed === expected */
  correct?: boolean;
  /** physical key that produced the edit (KeyEvent.code) */
  code?: string;
}

export interface SessionConfig {
  mode: 'time' | 'words' | 'quote' | 'zen' | 'custom';
  /** "15" | "30" | "60" | "120" for time, "10" | "25" | "50" | "100" for words, quote length for quote */
  mode2: string;
  language: string;
  punctuation: boolean;
  numbers: boolean;
  funbox: string[];
  difficulty?: 'normal' | 'expert' | 'master';
}

/** What Monkeytype's own result screen showed — used ONLY to cross-check our derived numbers. */
export interface MonkeytypeResult {
  wpm: number;
  rawWpm: number;
  /** percent, 0-100 */
  acc: number;
  /** percent, 0-100 */
  consistency: number;
  /** [correct, incorrect, extra, missed] */
  charStats?: [number, number, number, number];
  testDurationSec: number;
}

export type SessionFlag =
  | 'ime' // composition / dead keys seen: timing stats excluded
  | 'restart' // test restarted before finishing
  | 'blur' // window lost focus mid test
  | 'captureUnreliable'; // derived WPM/acc disagrees with Monkeytype's result screen

export interface Session {
  v: typeof SCHEMA_VERSION;
  /** stable unique id (uuid); import/sync is idempotent on this */
  id: string;
  /** epoch ms of the first accepted input */
  startedAt: number;
  /**
   * monkeytype         = recorded keystroke by keystroke by the extension
   * monkeytype-history = imported from Monkeytype's own results export (CSV): the result numbers only,
   *                      no keyEvents/inputEvents — so no replay and no key/n-gram/finger statistics
   */
  source: 'monkeytype' | 'monkeytype-history';
  /** only for monkeytype-history: the extra fields Monkeytype exports */
  history?: { mtId: string; isPb: boolean; restartCount: number; afkDurationSec: number; tags: string[] };
  config: SessionConfig;
  /** target words in order, as rendered (only the ones reached + a small lookahead is fine) */
  words: string[];
  keyEvents: KeyEvent[];
  inputEvents: InputEvent[];
  result?: MonkeytypeResult;
  /** true only when the result screen appeared */
  completed: boolean;
  flags: SessionFlag[];
  /** set on custom-text sessions started from a generated practice text */
  practice?: { focus: string[]; generatedAt: number };
  client: { extVersion: string };
}

// ---------------------------------------------------------------------------
// Derived — one row per typed character (computed by core/derive.ts)
// ---------------------------------------------------------------------------
export interface Keystroke {
  sessionId: string;
  /** order within the session */
  idx: number;
  /** ms since session start */
  t: number;
  code: string;
  typed: string;
  expected: string;
  correct: boolean;
  /** this wrong character was later deleted/corrected */
  corrected: boolean;
  wi: number;
  ci: number;
  /** previous typed character in the same word, if any */
  prev: string | null;
  /** inter-key interval: ms since previous keydown of the previous keystroke; null for the first key of a session or after a pause > pauseMs */
  ikiMs: number | null;
  /** keyup - keydown for this key; null if the keyup was never seen */
  holdMs: number | null;
  /** keydown(this) - keyup(prev); NEGATIVE means rollover (this key went down before the previous one was released) */
  flightMs: number | null;
  rollover: boolean;
  finger: FingerId;
  hand: Hand;
  row: Row;
}

// ---------------------------------------------------------------------------
// Analysis — what the dashboard renders
// ---------------------------------------------------------------------------
export interface AnalysisFilters {
  /** epoch ms, inclusive */
  from?: number;
  to?: number;
  modes?: SessionConfig['mode'][];
  languages?: string[];
  /** hide n-grams/keys/words with fewer occurrences than this (default 5) */
  minSamples?: number;
  /** include space-crossing bigrams/trigrams such as "e␣" (default false: within-word only) */
  includeSpaceNgrams?: boolean;
  /** only sessions started from generated practice text */
  practiceOnly?: boolean;
  /** exclude sessions flagged captureUnreliable / ime (default true) */
  excludeFlagged?: boolean;
}

export interface KeyStat {
  /** KeyboardEvent.code */
  code: string;
  /** printable character shown to the user, e.g. "a", "," or "␣" */
  char: string;
  finger: FingerId;
  hand: Hand;
  row: Row;
  /** attempts at this key (times the test asked for it) */
  count: number;
  /** 0-1: fraction of those attempts that produced a wrong character (corrected or not) */
  errorRate: number;
  medianIkiMs: number;
  medianHoldMs: number;
  /** what the user typed instead of this key, most frequent first (max 5) */
  confusions: Array<{ typed: string; count: number }>;
}

export interface NgramStat {
  /** e.g. "th" or "ing" */
  gram: string;
  n: 2 | 3;
  count: number;
  /** 0-1: error on the LAST char of the gram */
  errorRate: number;
  /** median time from first keydown to last keydown of the gram */
  medianMs: number;
  /** what the user's own per-key medians predict for this gram */
  expectedMs: number;
  /** medianMs - expectedMs; > 0 means the transition is harder than its keys suggest */
  costMs: number;
}

export interface WordStat {
  word: string;
  count: number;
  /** median per-word burst speed, WPM (5 chars = 1 word) */
  medianWpm: number;
  errorRate: number;
  /** fraction of attempts that contained a corrected mistake */
  correctedRate: number;
}

export interface FingerStat {
  finger: FingerId;
  hand: Hand;
  count: number;
  errorRate: number;
  medianIkiMs: number;
  medianHoldMs: number;
  /** 0-1: fraction of this finger's presses that overlapped the previous key */
  rolloverRate: number;
}

export interface HandStat {
  hand: Hand;
  count: number;
  errorRate: number;
  medianIkiMs: number;
  medianHoldMs: number;
}

export interface RowStat {
  row: Row;
  count: number;
  errorRate: number;
  medianIkiMs: number;
}

export interface OverallStat {
  /** Monkeytype-style WPM: correct-word chars + spaces, /5 per minute */
  wpm: number;
  rawWpm: number;
  /** percent 0-100, per keystroke */
  acc: number;
  /** percent 0-100 */
  consistency: number;
  medianIkiMs: number;
  medianHoldMs: number;
  rolloverRate: number;
  /** fraction of intervals longer than the pause threshold (hesitations) */
  pauseRate: number;
}

export interface Analysis {
  generatedAt: number;
  range: { from: number; to: number };
  sessions: number;
  keystrokes: number;
  minutes: number;
  overall: OverallStat;
  /** sorted by count desc */
  keys: KeyStat[];
  /** hardest first: by costMs, discounted when there are few samples */
  bigrams: NgramStat[];
  trigrams: NgramStat[];
  /** most error-prone first (discounted when there are few attempts), then slowest */
  words: WordStat[];
  fingers: FingerStat[];
  hands: HandStat[];
  rows: RowStat[];
  sameFingerBigram: { count: number; medianMs: number; errorRate: number };
  handAlternation: { alternatingMedianMs: number; sameHandMedianMs: number };
  /** histogram of inter-key intervals */
  ikiHistogram: { binMs: number; counts: number[] };
}

export interface SessionSummary {
  id: string;
  startedAt: number;
  config: SessionConfig;
  wpm: number;
  rawWpm: number;
  acc: number;
  consistency: number;
  durationSec: number;
  keystrokes: number;
  completed: boolean;
  flags: SessionFlag[];
  practice?: Session['practice'];
}

export interface ProgressPoint {
  /** YYYY-MM-DD (local time) */
  date: string;
  sessions: number;
  minutes: number;
  avgWpm: number;
  avgAcc: number;
  avgConsistency: number;
}

export interface GramTrend {
  gram: string;
  /** median transition ms in the earliest vs latest third of the range */
  firstMs: number;
  lastMs: number;
  /** lastMs - firstMs; negative = improved */
  deltaMs: number;
  count: number;
}

export interface ProgressSeries {
  points: ProgressPoint[];
  /** consecutive days with >=1 session ending today */
  currentStreakDays: number;
  longestStreakDays: number;
  improved: GramTrend[];
  regressed: GramTrend[];
}

/**
 * The per-second graph Monkeytype draws on its result screen but never saves — rebuilt from the recorded
 * keystrokes. Arrays are parallel; index i covers the i-th second (the last one may be partial).
 */
export interface TestChart {
  /** end of each interval in seconds: 1, 2, 3, ... and a fractional last value for a partial second */
  seconds: number[];
  /** Monkeytype-style WPM so far: correct characters (incl. spaces after correct words) up to that moment */
  wpm: number[];
  /** raw speed within that second: every character typed (right or wrong), as WPM */
  raw: number[];
  /** wrong characters typed within that second */
  errors: number[];
}

/** The result graph's numbers at one exact moment (between its whole seconds), for hovering anywhere on it. */
export interface SpeedPoint {
  /** ms since the first keystroke */
  t: number;
  /** Monkeytype-style WPM so far, as in TestChart.wpm */
  wpm: number;
  /** raw speed over the second before `t` (shorter at the very start), as in TestChart.raw */
  raw: number;
  /** wrong characters typed so far */
  errors: number;
}

/** Speed of each finished word ("burst" in Monkeytype), in test order. */
export interface WordBurst {
  wi: number;
  /** the target word */
  word: string;
  /** what was committed for it */
  typed: string;
  /** (typed length + space) as WPM over the time since the previous word was committed */
  wpm: number;
  /** wrong characters typed while on this word, including ones later corrected */
  errors: number;
  startMs: number;
  endMs: number;
}

/** The test as it looked at one moment (used to draw the replay). */
export interface TypedState {
  words: Array<{
    expected: string;
    typed: string;
    /** space was pressed to finish this word */
    completed: boolean;
    perChar: Array<{ typed: string; expected: string; correct: boolean }>;
  }>;
  caretWi: number;
  caretCi: number;
}

/** Everything the replay page needs for one session. */
export interface ReplayData {
  sessionId: string;
  config: SessionConfig;
  words: string[];
  durationMs: number;
  keyEvents: KeyEvent[];
  inputEvents: InputEvent[];
  /** rolling WPM per second for the strip under the text */
  wpmPerSecond: number[];
  /** ms of gaps longer than the pause threshold: [startMs, endMs] */
  pauses: Array<[number, number]>;
  /** Monkeytype-style result graph */
  chart: TestChart;
  bursts: WordBurst[];
  /** Monkeytype's own numbers for this test, when the result screen was captured */
  result?: MonkeytypeResult;
  startedAt: number;
  completed: boolean;
  flags: SessionFlag[];
}

// ---------------------------------------------------------------------------
// Practice generator (local, no AI)
// ---------------------------------------------------------------------------
export type PracticeFocus =
  | { kind: 'auto' } // top weak n-grams + keys from current Analysis
  | { kind: 'grams'; grams: string[] }
  | { kind: 'keys'; codes: string[] }
  | { kind: 'fingers'; fingers: FingerId[] };

export interface PracticeRequest {
  focus: PracticeFocus;
  /** number of words to generate (10-500) */
  length: number;
  /** accuracy: prefer grams with high errorRate; speed: prefer grams with high costMs */
  emphasis: 'accuracy' | 'speed' | 'balanced';
  hand: 'both' | 'L' | 'R';
  /** analysis filters used to pick weak spots when focus.kind === 'auto' */
  filters?: AnalysisFilters;
}

export interface PracticeResult {
  /** space-separated words, ready to paste into Monkeytype > custom text */
  text: string;
  words: string[];
  /** the grams/keys that were actually targeted */
  focus: string[];
  /** how many generated words contain each focus item */
  coverage: Record<string, number>;
  generatedAt: number;
}

// ---------------------------------------------------------------------------
// DataSource — the ONLY thing apps/web talks to.
//   MockDataSource  : seeded synthetic data (used while the UI is built)
//   LocalDataSource : Dexie/IndexedDB + core analysis (wired up later)
// ---------------------------------------------------------------------------
export interface ImportReport {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface DataSource {
  listSessions(filters?: AnalysisFilters): Promise<SessionSummary[]>;
  getAnalysis(filters?: AnalysisFilters): Promise<Analysis>;
  getProgress(filters?: AnalysisFilters): Promise<ProgressSeries>;
  getReplay(sessionId: string): Promise<ReplayData>;
  generatePractice(req: PracticeRequest): Promise<PracticeResult>;
  /** pull new sessions from the TypeLens Chrome extension (via its page bridge) */
  syncFromExtension(): Promise<ImportReport>;
  importJson(file: File): Promise<ImportReport>;
  exportJson(): Promise<Blob>;
  exportCsv(kind: 'sessions' | 'keystrokes'): Promise<Blob>;
  deleteSession(sessionId: string): Promise<void>;
  deleteAll(): Promise<void>;
  /** true when the extension bridge answered a ping (shows "connected" in the UI) */
  isExtensionConnected(): Promise<boolean>;
}
