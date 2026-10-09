/**
 * The real DataSource: sessions live wherever the host keeps them (the desktop app's files, or this browser's
 * IndexedDB), analysis is computed on demand by @typelens/core, and new sessions arrive from the extension
 * (pushed to the desktop host, or pulled through the browser bridge) or from an imported file.
 */
import {
  analyze,
  buildProgress,
  buildReplay,
  deriveKeystrokes,
  generatePractice,
  isMonkeytypeResultsCsv,
  isSameTest,
  parseMonkeytypeResultsCsv,
  keystrokesToCsv,
  mulberry32,
  parseImport,
  selectSessions,
  sessionSeconds,
  sessionStats,
  sessionsToCsv,
  type Analysis,
  type AnalysisFilters,
  type DataSource,
  type ImportReport,
  type PracticeRequest,
  type PracticeResult,
  type ProgressSeries,
  type ReplayData,
  type Session,
  type SessionSummary,
} from '@typelens/core';
import { PREF_PRACTICE_GENERATED, type TypeLensHost } from '@typelens/host-contract';
import { PRACTICE_WORDS } from './practiceWords';

/** The slice of the host this data source needs: where sessions live, where preferences live, where new tests come from. */
export type StorageHost = Pick<TypeLensHost, 'sessions' | 'prefs' | 'extension'>;

const HISTORY_MAX = 20;
const BATCH = 20;
const PUT_CHUNK = 500;

interface GeneratedEntry {
  generatedAt: number;
  focus: string[];
  words: string[];
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

/**
 * Whether the KEYSTROKES were captured properly: the speed rebuilt from them must match the WPM Monkeytype
 * showed. Only WPM is compared — it is the one result-screen number that has always been read reliably, so a
 * mis-read accuracy or duration never gets a correctly recorded test thrown out. The threshold is loose on purpose.
 */
export function looksUnreliable(s: Session): boolean {
  if (!s.result || !s.completed) return false;
  const ks = deriveKeystrokes(s);
  if (ks.length < 20) return false;
  const st = sessionStats(s, ks);
  return Math.abs(st.wpm - s.result.wpm) > Math.max(10, s.result.wpm * 0.15);
}

/**
 * Tests recorded by extension 0.1.0 against Monkeytype v26.32 have a mis-read result screen: accuracy, raw,
 * consistency and a duration of 0 (fixed in the extension). Their signature is testDurationSec <= 0; rebuild
 * those numbers from the keystrokes and keep Monkeytype's WPM, which was read correctly.
 */
export function repairResult(s: Session): Session {
  if (!s.result || s.result.testDurationSec > 0) return s;
  const { result: _bad, ...raw } = s;
  const st = sessionStats(raw, deriveKeystrokes(raw));
  return { ...s, result: { ...s.result, rawWpm: st.rawWpm, acc: st.acc, consistency: st.consistency, testDurationSec: st.seconds } };
}
export class LocalDataSource implements DataSource {
  private cache: Session[] | null = null;
  private analyses = new Map<string, Analysis>();
  private listeners = new Set<() => void>();
  private version = 0;
  /** bumped by invalidate(): a load that started before it must not fill the cache with stale rows */
  private generation = 0;
  private loading: Promise<Session[]> | null = null;

  constructor(private readonly host: StorageHost) {}

  // ---------------------------------------------------------------- change notification

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  getVersion(): number {
    return this.version;
  }
  async count(): Promise<number> {
    return this.host.sessions.count();
  }

  /** The stored sessions changed behind our back (the desktop host received a test from the extension). */
  reload(): void {
    this.invalidate();
  }

  private invalidate(): void {
    this.cache = null;
    this.loading = null;
    this.generation++;
    this.analyses.clear();
    this.version++;
    this.listeners.forEach((l) => l());
  }

  private async sessions(): Promise<Session[]> {
    // stored exactly as recorded; cleaning happens here so later fixes also apply to tests already stored
    if (this.cache) return this.cache;
    if (!this.loading) {
      const gen = this.generation;
      const p = this.load().then((rows) => {
        if (gen === this.generation) {
          this.cache = rows;
          this.loading = null;
        }
        return rows;
      });
      p.catch(() => {
        if (this.loading === p) this.loading = null;
      });
      this.loading = p;
    }
    return this.loading;
  }

  private async load(): Promise<Session[]> {
    const history = await this.readHistory();
    // hosts list in no particular order; analysis wants oldest first
    const stored = (await this.host.sessions.list()).sort((a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : 1));
    const all = stored.map((s) => this.prepare(s, history));
    // a history row for a test that was also recorded (either import order) is shown once, as the recording
    const recorded = all.filter((s) => s.source === 'monkeytype');
    return all.filter((s) => s.source !== 'monkeytype-history' || !recorded.some((r) => isSameTest(s, r)));
  }

  /** The host takes a bounded number of sessions per call (the desktop IPC refuses huge lists): Monkeytype histories have tens of thousands. */
  private async putAll(sessions: Session[]): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;
    for (let i = 0; i < sessions.length; i += PUT_CHUNK) {
      const r = await this.host.sessions.putMany(sessions.slice(i, i + PUT_CHUNK));
      added += r.added;
      skipped += r.skipped;
    }
    return { added, skipped };
  }

  // ---------------------------------------------------------------- reads

  async listSessions(filters?: AnalysisFilters): Promise<SessionSummary[]> {
    // the list shows flagged sessions too (with their flags); analysis excludes them by default
    const picked = selectSessions(await this.sessions(), { ...filters, excludeFlagged: filters?.excludeFlagged ?? false });
    return picked
      .map((s): SessionSummary => {
        const ks = deriveKeystrokes(s);
        const st = sessionStats(s, ks);
        const sum: SessionSummary = {
          id: s.id,
          startedAt: s.startedAt,
          config: s.config,
          wpm: round1(s.result?.wpm ?? st.wpm),
          rawWpm: round1(s.result?.rawWpm ?? st.rawWpm),
          acc: round1(s.result?.acc ?? st.acc),
          consistency: round1(s.result?.consistency ?? st.consistency),
          durationSec: round1(sessionSeconds(s, ks)),
          keystrokes: ks.length,
          completed: s.completed,
          flags: s.flags,
        };
        if (s.practice) sum.practice = s.practice;
        return sum;
      })
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  async getAnalysis(filters?: AnalysisFilters): Promise<Analysis> {
    const key = JSON.stringify(filters ?? {});
    const hit = this.analyses.get(key);
    if (hit) return hit;
    const gen = this.generation;
    const a = analyze(await this.sessions(), filters ?? {}, Date.now());
    if (gen === this.generation) this.analyses.set(key, a);
    return a;
  }

  async getProgress(filters?: AnalysisFilters): Promise<ProgressSeries> {
    return buildProgress(await this.sessions(), filters ?? {}, Date.now());
  }

  async getReplay(sessionId: string): Promise<ReplayData> {
    const s = (await this.sessions()).find((x) => x.id === sessionId);
    if (!s) throw new Error(`No session with id ${sessionId}`);
    return buildReplay(s);
  }

  // ---------------------------------------------------------------- practice

  async generatePractice(req: PracticeRequest): Promise<PracticeResult> {
    const analysis = await this.getAnalysis(req.filters);
    const now = Date.now();
    const res = generatePractice(req, analysis, PRACTICE_WORDS, { rng: mulberry32(now & 0x7fffffff), now });
    // remembered so that a later custom-text test can be linked to this practice (before/after view)
    await this.writeHistory([{ generatedAt: now, focus: res.focus, words: res.words }, ...(await this.readHistory())].slice(0, HISTORY_MAX));
    return res;
  }

  private async readHistory(): Promise<GeneratedEntry[]> {
    try {
      const parsed = await this.host.prefs.get<unknown>(PREF_PRACTICE_GENERATED);
      return Array.isArray(parsed) ? (parsed as GeneratedEntry[]) : [];
    } catch {
      return [];
    }
  }
  private async writeHistory(entries: GeneratedEntry[]): Promise<void> {
    try {
      await this.host.prefs.set(PREF_PRACTICE_GENERATED, entries);
    } catch {
      /* storage unavailable: linking is a convenience only */
    }
  }

  /** Marks a custom-text session as practice when its words are (almost all) from a text we generated. */
  private linkPractice(s: Session, history: GeneratedEntry[]): Session {
    if (s.config.mode !== 'custom' || s.practice) return s;
    const target = s.words.filter(Boolean).slice(0, 30);
    if (target.length < 5) return s;
    for (const g of history) {
      if (g.generatedAt > s.startedAt) continue;
      const set = new Set(g.words);
      if (target.filter((w) => set.has(w)).length / target.length >= 0.8) return { ...s, practice: { focus: g.focus, generatedAt: g.generatedAt } };
    }
    return s;
  }

  private prepare(s: Session, history: GeneratedEntry[]): Session {
    // captureUnreliable is only ever set here (never by the extension), so drop any stored copy and re-judge with
    // the current rules — older versions saved it permanently and wrongly threw out correctly recorded tests
    const unflagged = s.flags.includes('captureUnreliable') ? { ...s, flags: s.flags.filter((f) => f !== 'captureUnreliable') } : s;
    let out = this.linkPractice(repairResult(unflagged), history);
    if (looksUnreliable(out) && !out.flags.includes('captureUnreliable')) out = { ...out, flags: [...out.flags, 'captureUnreliable'] };
    return out;
  }

  // ---------------------------------------------------------------- importing

  async syncFromExtension(): Promise<ImportReport> {
    const { extension } = this.host;
    const { fresh, known } = await extension.listPending();

    let imported = 0;
    let skipped = known.length;
    const errors: string[] = [];
    const ackable = [...known];
    for (let i = 0; i < fresh.length; i += BATCH) {
      const raw = await extension.pullPending(fresh.slice(i, i + BATCH));
      const parsed = parseImport({ v: 1, sessions: raw });
      errors.push(...parsed.errors);
      const r = await this.putAll(parsed.sessions);
      imported += r.added;
      skipped += r.skipped;
      ackable.push(...parsed.sessions.map((s) => s.id));
    }
    // tell the extension what we now hold, so its badge clears; its own copy is kept until the user deletes it
    if (ackable.length) await extension.ack(ackable);
    this.invalidate();
    return { imported, skipped, errors };
  }

  /** A TypeLens JSON export, or Monkeytype's own results export (CSV from Account -> export). */
  async importJson(file: File): Promise<ImportReport> {
    const text = await file.text();
    if (isMonkeytypeResultsCsv(text)) return this.importMonkeytypeHistory(text);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { imported: 0, skipped: 0, errors: ['That file is neither a TypeLens JSON export nor a Monkeytype results CSV.'] };
    }
    const parsed = parseImport(json);
    const r = await this.putAll(parsed.sessions);
    this.invalidate();
    return { imported: r.added, skipped: r.skipped, errors: parsed.errors };
  }

  /**
   * Monkeytype's history has result numbers only. A row for a test the extension ALSO recorded is skipped:
   * the recording has the same numbers plus every keystroke.
   */
  private async importMonkeytypeHistory(text: string): Promise<ImportReport> {
    const parsed = parseMonkeytypeResultsCsv(text);
    const recorded = (await this.host.sessions.list()).filter((s) => s.source === 'monkeytype').map((s) => repairResult(s));
    const fresh = parsed.sessions.filter((h) => !recorded.some((r) => isSameTest(h, r)));
    const r = await this.putAll(fresh);
    this.invalidate();
    return { imported: r.added, skipped: r.skipped + (parsed.sessions.length - fresh.length), errors: parsed.errors };
  }

  // ---------------------------------------------------------------- exporting / deleting

  async exportJson(): Promise<Blob> {
    return new Blob([JSON.stringify({ v: 1, sessions: await this.sessions() })], { type: 'application/json' });
  }

  async exportCsv(kind: 'sessions' | 'keystrokes'): Promise<Blob> {
    const all = await this.sessions();
    return new Blob([kind === 'sessions' ? sessionsToCsv(all) : keystrokesToCsv(all)], { type: 'text/csv' });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.host.sessions.delete(sessionId);
    this.invalidate();
  }

  async deleteAll(): Promise<void> {
    await this.host.sessions.clear();
    this.invalidate();
  }

  async isExtensionConnected(): Promise<boolean> {
    return (await this.host.extension.status()).connected;
  }
}
