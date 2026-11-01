/**
 * The ONLY way the TypeLens UI (apps/web) talks to whatever is hosting it.
 *
 * Each runtime installs its own implementation:
 *   - desktop: apps/desktop's preload exposes it as `window.typelensHost` (storage, dialogs, updates live in the
 *     Electron main process);
 *   - browser: apps/web/src/host/webHost.ts builds one from IndexedDB, localStorage and the extension bridge;
 *   - extension: apps/extension/src/dashboard/host.ts installs it as `window.typelensHost` on the dashboard page
 *     bundled with the browser extension, on top of the extension's own database.
 * The UI never checks "am I in Electron"; it reads `capabilities` to know what the platform can do.
 * Types only: keep this package free of runtime code so every side can import it cheaply.
 */
import type { Session } from '@typelens/core/schema';
import type { MonkeytypeTheme } from '@typelens/core/desktop';

export type Unsubscribe = () => void;

export interface Capabilities {
  /** native open/save dialogs (otherwise <input type=file> and browser downloads) */
  nativeFiles: boolean;
  /** native OS notifications */
  notifications: boolean;
  /** the host can download and install new versions of itself */
  autoUpdate: boolean;
  /** the extension pushes tests to the host (otherwise the UI pulls them through a page bridge) */
  extensionPush: boolean;
  /** the host can open folders in the file manager */
  openFolders: boolean;
  startAtLogin: boolean;
  /** the recorder writes straight into this host's store (the dashboard inside the extension): nothing to sync */
  builtInRecorder: boolean;
}

export interface AppInfo {
  name: string;
  version: string;
  platform: 'win32' | 'darwin' | 'linux' | 'web';
  /** where the host keeps its data, for display only (null in a browser) */
  dataDir: string | null;
}

// ---------------------------------------------------------------- sessions

export interface PutResult {
  /** newly stored */
  added: number;
  /** ids that were already stored (storing is idempotent by id) */
  skipped: number;
}

export interface SessionsApi {
  list(): Promise<Session[]>;
  /** Inserts sessions whose id is not stored yet. A host may reject sessions that fail validation by throwing. */
  putMany(sessions: Session[]): Promise<PutResult>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  count(): Promise<number>;
  /** stored sessions changed behind the UI's back (e.g. the desktop app received a test from the extension) */
  onChange(cb: (e: SessionsChange) => void): Unsubscribe;
}

export interface SessionsChange {
  /** how many sessions were just added by the host itself (0 when unknown) */
  added: number;
}

// ---------------------------------------------------------------- preferences

/** Small JSON values the UI wants to remember. Keys: letters, digits, `.`, `_`, `-`; max 64 chars. */
export interface PrefsApi {
  get<T = unknown>(key: string): Promise<T | null>;
  /** `null` removes the key */
  set(key: string, value: unknown): Promise<void>;
}

// ---------------------------------------------------------------- extension sync

export interface EndpointStatus {
  host: string;
  port: number;
  listening: boolean;
  /** human-readable reason when it is not listening */
  error: string | null;
}

export interface PairedExtension {
  id: string;
  version: string | null;
  /** last time the extension contacted the host (ms epoch) */
  lastSeenAt: number | null;
  /** last time a recorder was alive on a Monkeytype tab (ms epoch) */
  recorderSeenAt: number | null;
  /** recorder self-check reported by the extension; `missing` lists what it could not read */
  health: { ok: boolean; missing: string[] } | null;
}

export interface ExtensionStatus {
  /** 'push': the extension delivers to the host. 'bridge': the UI pulls through a page bridge. */
  transport: 'push' | 'bridge';
  /** push: endpoint up and an extension paired. bridge: the extension answered a ping. */
  connected: boolean;
  /** only for 'push' */
  endpoint: EndpointStatus | null;
  paired: PairedExtension | null;
  /** folder to pick in chrome://extensions > Load unpacked (null when the host cannot offer one) */
  extensionFolder: string | null;
  /** sessions delivered but not yet stored (normally 0: the desktop host stores them immediately) */
  pending: number;
  /** the user's Monkeytype theme as last reported by the extension (null: not known yet) */
  monkeytypeTheme: MonkeytypeTheme | null;
}

export interface PendingIds {
  /** not stored yet: pull these */
  fresh: string[];
  /** already stored by the host; they only need an ack */
  known: string[];
}

export interface ExtensionApi {
  status(): Promise<ExtensionStatus>;
  /** ids the extension has delivered or is holding for this host */
  listPending(): Promise<PendingIds>;
  /** raw sessions for these ids (the UI validates them before storing) */
  pullPending(ids: string[]): Promise<unknown[]>;
  /** tells the extension/host these ids are safely stored */
  ack(ids: string[]): Promise<void>;
  /** forget the paired extension so another one can pair (push transport only) */
  resetPairing(): Promise<void>;
  onChange(cb: () => void): Unsubscribe;
}

// ---------------------------------------------------------------- files

export interface FileFilter {
  name: string;
  /** without dots, e.g. ['json'] */
  extensions: string[];
}

export interface FilesApi {
  /** Asks the user for a JSON/CSV file. Resolves null when they cancel. */
  openImportFile(): Promise<{ name: string; text: string } | null>;
  /** Asks where to save. Resolves the saved file's name, or null when the user cancels. */
  saveExport(defaultName: string, content: string, filters: FileFilter[]): Promise<string | null>;
}

// ---------------------------------------------------------------- shell

export interface ShellApi {
  /** https links only */
  openExternal(url: string): Promise<void>;
  openDataFolder(): Promise<void>;
  openExtensionFolder(): Promise<void>;
  revealLogs(): Promise<void>;
}

// ---------------------------------------------------------------- updates

export type UpdateState =
  | { status: 'idle'; checkedAt: number | null }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }
  | { status: 'unsupported'; reason: string };

export interface UpdatesApi {
  state(): Promise<UpdateState>;
  check(): Promise<UpdateState>;
  /** quits and installs a downloaded update; only valid in the 'ready' state */
  installAndRestart(): Promise<void>;
  onChange(cb: (s: UpdateState) => void): Unsubscribe;
}

// ---------------------------------------------------------------- settings

export interface SettingsApi {
  getStartAtLogin(): Promise<boolean>;
  setStartAtLogin(on: boolean): Promise<void>;
  getNotifyOnNewTest(): Promise<boolean>;
  setNotifyOnNewTest(on: boolean): Promise<void>;
}

// ---------------------------------------------------------------- the host

export interface TypeLensHost {
  kind: 'desktop' | 'web';
  capabilities: Capabilities;
  app: { info(): Promise<AppInfo> };
  sessions: SessionsApi;
  prefs: PrefsApi;
  extension: ExtensionApi;
  files: FilesApi;
  shell: ShellApi;
  updates: UpdatesApi;
  settings: SettingsApi;
  /** menu / shortcut driven page switch (desktop menu: Ctrl+1..9). Web hosts never fire it. */
  onNavigate(cb: (path: string) => void): Unsubscribe;
  /** menu actions that need the UI (import/export dialogs live on the Data page) */
  onMenuAction(cb: (action: MenuAction) => void): Unsubscribe;
}

export type MenuAction = 'import' | 'export-json';

declare global {
  interface Window {
    /** installed by the desktop preload or the extension's dashboard page; absent in a plain browser tab */
    typelensHost?: TypeLensHost;
  }
}

/** Preference keys used by the UI, in one place so hosts and tests agree. */
export const PREF_SOURCE = 'typelens.source';
export const PREF_PRACTICE_GENERATED = 'typelens.practice.generated';
export const PREF_PRACTICE_HISTORY = 'typelens.practice.history';
export const PREF_THEME = 'typelens.theme';
export const PREF_GOALS = 'typelens.goals';

/** The settings page; not part of NAV_PATHS (those are the Ctrl/Cmd+1..9 pages). Opened with Ctrl/Cmd+, */
export const SETTINGS_PATH = '/settings';

/** Dashboard pages in menu order (Ctrl/Cmd+1..9). Shared so the sidebar and the desktop menu cannot drift. */
export const NAV_PATHS = ['/', '/keys', '/ngrams', '/words', '/fingers', '/replay', '/progress', '/practice', '/data'] as const;
