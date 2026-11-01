/**
 * The TypeLensHost for the dashboard page bundled with the extension (dashboard/index.html). It runs before the
 * dashboard's own scripts and installs itself as `window.typelensHost`, exactly like the desktop preload does, so
 * the dashboard needs no special case: it simply finds a host.
 *
 * The page has the extension's origin, so it opens the recorder's own IndexedDB database directly. There is no
 * second copy and nothing to sync: a finished test shows up as soon as the recorder stores it. This is the way to
 * use TypeLens without installing the desktop app. The desktop push keeps working next to it.
 */
import { sanitizeMonkeytypeTheme } from '@typelens/core/desktop';
import type { Session } from '@typelens/core/schema';
import type { FileFilter, SessionsChange, TypeLensHost, UpdateState } from '@typelens/host-contract';
import { createDb, type Db } from '../db';
import { SESSIONS_CHANGED, type Msg } from '../protocol';

export interface ExtensionHostDeps {
  db: Db;
  version: string;
  /** chrome.storage.local (preferences live in localStorage; this holds what the recorder writes, e.g. the theme) */
  storageGet(keys: string[]): Promise<Record<string, unknown>>;
  /** tells the background worker the page changed the database: refresh the badge, and deliver new tests if `deliver` */
  notifyChanged(deliver: boolean): void;
  /** subscribe to "the recorder stored a test" and "the Monkeytype theme changed" */
  onSessionsChanged(cb: () => void): () => void;
  onThemeChanged(cb: () => void): () => void;
  openTab(url: string): void;
  prefs: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } | null;
  download?: (content: string, filename: string, mime: string) => void;
  pickFile?: () => Promise<{ name: string; text: string } | null>;
}

const NOT_HERE = (what: string): Error => new Error(`${what} is only available in the desktop app.`);
const UNSUPPORTED: UpdateState = { status: 'unsupported', reason: 'The extension is updated by the browser (or by loading a new version).' };

function decode(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function downloadText(content: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickTextFile(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json,text/csv,.csv';
    input.style.display = 'none';
    const finish = (v: { name: string; text: string } | null): void => {
      input.remove();
      resolve(v);
    };
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (!f) return finish(null);
      f.text().then((text) => finish({ name: f.name, text }), (err: unknown) => (input.remove(), reject(err)));
    });
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

const mimeFor = (filters: FileFilter[], name: string): string => {
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() ?? filters[0]?.extensions[0];
  return ext === 'csv' ? 'text/csv' : ext === 'json' ? 'application/json' : 'text/plain';
};

export function createExtensionHost(deps: ExtensionHostDeps): TypeLensHost {
  const { db } = deps;
  const memory = new Map<string, unknown>();
  const noop = (): (() => void) => () => undefined;

  return {
    kind: 'web',
    capabilities: {
      nativeFiles: false,
      notifications: false,
      autoUpdate: false,
      extensionPush: false,
      openFolders: false,
      startAtLogin: false,
      builtInRecorder: true,
    },
    app: { info: async () => ({ name: 'TypeLens', version: deps.version, platform: 'web', dataDir: null }) },

    sessions: {
      async list() {
        const all = await db.all();
        // the user is looking at them now: clear the "not yet delivered" badge (desktop delivery is tracked apart)
        await db.markAllSynced();
        deps.notifyChanged(false);
        return all;
      },
      async putMany(sessions: Session[]) {
        const r = await db.addMany(sessions);
        if (r.added) deps.notifyChanged(true);
        return r;
      },
      async delete(id) {
        await db.delete(id);
        deps.notifyChanged(false);
      },
      async clear() {
        await db.clear();
        deps.notifyChanged(false);
      },
      count: async () => (await db.count()).total,
      onChange(cb: (e: SessionsChange) => void) {
        return deps.onSessionsChanged(() => cb({ added: 0 }));
      },
    },

    prefs: {
      async get<T>(key: string) {
        if (memory.has(key)) return memory.get(key) as T | null;
        try {
          return decode(deps.prefs?.getItem(key) ?? null) as T | null;
        } catch {
          return null;
        }
      },
      async set(key, value) {
        if (value === null || value === undefined) memory.delete(key);
        else memory.set(key, value);
        try {
          if (value === null || value === undefined) deps.prefs?.removeItem(key);
          else deps.prefs?.setItem(key, JSON.stringify(value));
          if (deps.prefs) memory.delete(key);
        } catch {
          /* storage unavailable or full: kept in memory for this page */
        }
      },
    },

    extension: {
      async status() {
        const st = await deps.storageGet(['mtTheme']).catch(() => ({}) as Record<string, unknown>);
        return {
          transport: 'bridge',
          connected: true, // this page IS the extension
          endpoint: null,
          paired: null,
          extensionFolder: null,
          pending: 0,
          monkeytypeTheme: sanitizeMonkeytypeTheme(st.mtTheme),
        };
      },
      // the recorder writes into the same database the dashboard reads, so there is never anything to pull
      listPending: async () => ({ fresh: [], known: [] }),
      pullPending: async () => [],
      ack: async () => undefined,
      resetPairing: () => Promise.reject(NOT_HERE('Pairing')),
      onChange: (cb) => deps.onThemeChanged(cb),
    },

    files: {
      openImportFile: () => (deps.pickFile ?? pickTextFile)(),
      async saveExport(defaultName, content, filters) {
        (deps.download ?? downloadText)(content, defaultName, mimeFor(filters, defaultName));
        return defaultName;
      },
    },

    shell: {
      async openExternal(url) {
        if (!/^https:\/\//.test(url)) throw new Error('Only https links can be opened.');
        deps.openTab(url);
      },
      openDataFolder: () => Promise.reject(NOT_HERE('Opening the data folder')),
      openExtensionFolder: () => Promise.reject(NOT_HERE('Opening the extension folder')),
      revealLogs: () => Promise.reject(NOT_HERE('Opening the logs')),
    },

    updates: {
      state: async () => UNSUPPORTED,
      check: async () => UNSUPPORTED,
      installAndRestart: () => Promise.reject(NOT_HERE('Installing updates')),
      onChange: noop,
    },

    settings: {
      getStartAtLogin: async () => false,
      setStartAtLogin: () => Promise.reject(NOT_HERE('Start at login')),
      getNotifyOnNewTest: async () => false,
      setNotifyOnNewTest: () => Promise.reject(NOT_HERE('Notifications')),
    },

    onNavigate: noop,
    onMenuAction: noop,
  };
}

/** Wires the host to the real chrome.* APIs; only runs on the dashboard page. */
export function installExtensionHost(): void {
  let prefs: ExtensionHostDeps['prefs'] = null;
  try {
    prefs = localStorage;
  } catch {
    prefs = null;
  }
  const send = (msg: Msg): void => void chrome.runtime.sendMessage(msg).catch(() => undefined);
  window.typelensHost = createExtensionHost({
    db: createDb(),
    version: chrome.runtime.getManifest().version,
    storageGet: (keys) => chrome.storage.local.get(keys),
    notifyChanged: (deliver) => send({ type: 'dash:changed', deliver }),
    onSessionsChanged(cb) {
      const fn = (m: unknown): void => {
        if (m && typeof m === 'object' && (m as { type?: unknown }).type === SESSIONS_CHANGED) cb();
      };
      chrome.runtime.onMessage.addListener(fn);
      return () => chrome.runtime.onMessage.removeListener(fn);
    },
    onThemeChanged(cb) {
      const fn = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
        if (area === 'local' && changes.mtTheme) cb();
      };
      chrome.storage.onChanged.addListener(fn);
      return () => chrome.storage.onChanged.removeListener(fn);
    },
    openTab: (url) => void chrome.tabs.create({ url }),
    prefs,
  });
}
