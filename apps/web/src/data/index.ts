import { createContext, useContext, useSyncExternalStore } from 'react';
import type {
  Analysis,
  AnalysisFilters,
  DataSource,
  ImportReport,
  PracticeRequest,
  PracticeResult,
  ProgressSeries,
  ReplayData,
  SessionSummary,
} from './types';
import { PREF_SOURCE, type TypeLensHost } from '@typelens/host-contract';
import { LocalDataSource } from './LocalDataSource';
import type { Bridge } from './bridge';
import { generateDemoSessions, memoryStore } from './demo';
import { createWebHost, getHost } from '@/host';

/* ============================================================================
 * Data entry point.
 *
 * Every screen talks only to the DataSource interface. `dataSource` below is a thin switch between
 *   - the user's real sessions (kept by the host: files on desktop, IndexedDB in a browser), and
 *   - generated demo sessions (in memory), shown while there are no real sessions yet.
 * Both run through the same LocalDataSource + @typelens/core pipeline.
 * Writes (sync, import, export, delete) always go to the real store.
 * ------------------------------------------------------------------------- */

export type SourcePref = 'auto' | 'demo' | 'mine';
export type EffectiveSource = 'demo' | 'mine';

const isPref = (v: unknown): v is SourcePref => v === 'auto' || v === 'demo' || v === 'mine';

export interface SourceInfo {
  pref: SourcePref;
  effective: EffectiveSource;
  /** number of real sessions stored (null until first known) */
  realCount: number | null;
  /** bumps whenever what the UI should show changed (sync, import, delete, source switch) */
  version: number;
}

const offlineBridge: Bridge = {
  request: () => Promise.reject(new Error('Demo data has no extension.')),
  ping: async () => false,
};

class SwitchingDataSource implements DataSource {
  readonly local: LocalDataSource;
  private demo: LocalDataSource | null = null;
  private info: SourceInfo = { pref: 'auto', effective: 'demo', realCount: null, version: 0 };
  private listeners = new Set<() => void>();
  /** the saved source choice is read asynchronously (the desktop host keeps it on disk) */
  private prefLoaded: Promise<void>;
  private prefChosen = false;
  /** refreshes can overlap; only the newest one may publish, but a change flagged by an older one must still bump the version */
  private seq = 0;
  private dirty = false;

  constructor(private readonly host: TypeLensHost) {
    this.local = new LocalDataSource(host);
    this.local.subscribe(() => void this.refresh(true));
    // the desktop app stores tests the extension pushed while the UI was looking elsewhere
    host.sessions.onChange(() => this.local.reload());
    this.prefLoaded = host.prefs.get<unknown>(PREF_SOURCE).then(
      (v) => {
        if (isPref(v) && !this.prefChosen) this.info = { ...this.info, pref: v };
      },
      () => undefined,
    );
    void this.refresh();
  }

  // ---- external-store plumbing for React
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getInfo = (): SourceInfo => this.info;

  setPref(pref: SourcePref): void {
    this.prefChosen = true;
    this.host.prefs.set(PREF_SOURCE, pref).catch(() => undefined); // not persisting is only an inconvenience
    this.info = { ...this.info, pref };
    void this.refresh(true);
  }

  private async refresh(changed = false): Promise<void> {
    if (changed) this.dirty = true;
    await this.prefLoaded;
    const seq = ++this.seq;
    let realCount: number;
    try {
      realCount = await this.local.count();
    } catch {
      realCount = 0; // IndexedDB unavailable: behave like an empty store
    }
    if (seq !== this.seq) return;
    changed = this.dirty;
    this.dirty = false;
    const { pref } = this.info;
    const effective: EffectiveSource = pref === 'demo' ? 'demo' : pref === 'mine' ? 'mine' : realCount > 0 ? 'mine' : 'demo';
    if (changed || effective !== this.info.effective || realCount !== this.info.realCount) {
      this.info = { pref, effective, realCount, version: this.info.version + 1 };
      this.listeners.forEach((l) => l());
    }
  }

  private demoSource(): LocalDataSource {
    // generated lazily: users with real data never pay for it
    this.demo ??= new LocalDataSource(createWebHost({ store: memoryStore(generateDemoSessions(Date.now())), bridge: offlineBridge, storage: null }));
    return this.demo;
  }

  private async read(): Promise<DataSource> {
    if (this.info.realCount === null) await this.refresh();
    return this.info.effective === 'mine' ? this.local : this.demoSource();
  }

  // ---- reads follow the effective source
  async listSessions(f?: AnalysisFilters): Promise<SessionSummary[]> {
    return (await this.read()).listSessions(f);
  }
  async getAnalysis(f?: AnalysisFilters): Promise<Analysis> {
    return (await this.read()).getAnalysis(f);
  }
  async getProgress(f?: AnalysisFilters): Promise<ProgressSeries> {
    return (await this.read()).getProgress(f);
  }
  async getReplay(id: string): Promise<ReplayData> {
    return (await this.read()).getReplay(id);
  }
  async generatePractice(r: PracticeRequest): Promise<PracticeResult> {
    return (await this.read()).generatePractice(r);
  }

  // ---- writes and the extension always concern the real store
  syncFromExtension(): Promise<ImportReport> {
    return this.local.syncFromExtension();
  }
  importJson(file: File): Promise<ImportReport> {
    return this.local.importJson(file);
  }
  exportJson(): Promise<Blob> {
    return this.local.exportJson();
  }
  exportCsv(kind: 'sessions' | 'keystrokes'): Promise<Blob> {
    return this.local.exportCsv(kind);
  }
  deleteSession(id: string): Promise<void> {
    return this.local.deleteSession(id);
  }
  deleteAll(): Promise<void> {
    return this.local.deleteAll();
  }
  isExtensionConnected(): Promise<boolean> {
    return this.local.isExtensionConnected();
  }
}

const switching = new SwitchingDataSource(getHost());
export const dataSource: DataSource = switching;
/** The user's real sessions only (never the demo) — for the Data page, which manages what is stored. */
export const realDataSource: DataSource = switching.local;

/** React context so any component can reach the active DataSource. */
export const DataSourceContext = createContext<DataSource>(dataSource);

/** Convenience hook used across the app to obtain the active DataSource. */
export function useDataSource(): DataSource {
  return useContext(DataSourceContext);
}

/** Which data the UI is currently showing (demo vs the user's own), plus a setter for the preference. */
export function useSourceInfo(): SourceInfo & { setPref: (p: SourcePref) => void } {
  const info = useSyncExternalStore(switching.subscribe, switching.getInfo, switching.getInfo);
  return { ...info, setPref: (p) => switching.setPref(p) };
}

/** Changes whenever the data behind the UI changes; add it to data-fetching effect dependencies. */
export function useDataVersion(): number {
  return useSyncExternalStore(switching.subscribe, () => switching.getInfo().version, () => switching.getInfo().version);
}

export type { DataSource } from './types';
export * from './types';
