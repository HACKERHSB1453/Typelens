/**
 * The TypeLensHost for a plain browser tab: sessions in IndexedDB (store.ts), preferences in localStorage, the
 * Chrome extension reached through its page bridge (bridge.ts), files through <input type=file> and Blob
 * downloads. Nothing here needs a desktop shell, so the capability flags are mostly false.
 * Every dependency can be injected, which is how the tests run this without a browser.
 */
import type { Session } from '@typelens/core/schema';
import type { FileFilter, TypeLensHost, UpdateState } from '@typelens/host-contract';
import { createBridge, type Bridge } from '../data/bridge';
import { createStore, type SessionStore } from '../data/store';

export type PrefStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem?(k: string): void };

export interface WebHostDeps {
  store?: SessionStore;
  bridge?: Bridge;
  /** null: keep preferences in memory only */
  storage?: PrefStorage | null;
  /** hand a text file to the user (default: a Blob download) */
  download?: (content: string, filename: string, mime: string) => void;
  /** let the user pick a text file (default: <input type=file>) */
  pickFile?: () => Promise<{ name: string; text: string } | null>;
  openUrl?: (url: string) => void;
  version?: string;
}

const BATCH_NOTE = 'only available in the desktop app';
const NOT_HERE = (what: string): Error => new Error(`${what} is ${BATCH_NOTE}.`);
const UNSUPPORTED: UpdateState = { status: 'unsupported', reason: 'The browser version updates whenever you reload the page.' };

function browserStorage(): PrefStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // blocked by the browser (private mode, site data disabled)
  }
}

/** Values written by older versions are raw strings ('demo'); everything written now is JSON. */
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
      f.text().then((text) => finish({ name: f.name, text }), (err) => (input.remove(), reject(err)));
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

export function createWebHost(deps: WebHostDeps = {}): TypeLensHost {
  let store = deps.store ?? null;
  let bridge = deps.bridge ?? null;
  // created on first use so merely importing this module never touches IndexedDB or window
  const getStore = (): SessionStore => (store ??= createStore());
  const getBridge = (): Bridge => (bridge ??= createBridge());
  const storage = deps.storage === undefined ? browserStorage() : deps.storage;
  const memory = new Map<string, unknown>();
  const noop = (): (() => void) => () => undefined;

  return {
    kind: 'web',
    capabilities: { nativeFiles: false, notifications: false, autoUpdate: false, extensionPush: false, openFolders: false, startAtLogin: false },
    app: { info: async () => ({ name: 'TypeLens', version: deps.version ?? 'web', platform: 'web', dataDir: null }) },

    sessions: {
      async list() {
        return getStore().all();
      },
      async putMany(sessions: Session[]) {
        return getStore().putMany(sessions);
      },
      delete: (id) => getStore().delete(id),
      clear: () => getStore().clear(),
      count: () => getStore().count(),
      onChange: noop, // this tab is the only writer
    },

    prefs: {
      async get<T>(key: string) {
        if (memory.has(key)) return memory.get(key) as T | null;
        try {
          return decode(storage?.getItem(key) ?? null) as T | null;
        } catch {
          return null;
        }
      },
      async set(key, value) {
        if (value === null || value === undefined) memory.delete(key);
        else memory.set(key, value);
        try {
          if (value === null || value === undefined) storage?.removeItem?.(key);
          else storage?.setItem(key, JSON.stringify(value));
          // persisted: no need to shadow the stored value with the in-memory copy
          if (storage) memory.delete(key);
        } catch {
          /* storage unavailable or full: the value lives on in memory for this page only */
        }
      },
    },

    extension: {
      async status() {
        return { transport: 'bridge', connected: await getBridge().ping(), endpoint: null, paired: null, extensionFolder: null, pending: 0 };
      },
      async listPending() {
        const { ids } = await getBridge().request<{ ids: string[] }>('list');
        const fresh: string[] = [];
        const known: string[] = [];
        for (const id of ids) ((await getStore().has(id)) ? known : fresh).push(id);
        return { fresh, known };
      },
      async pullPending(ids) {
        const { sessions } = await getBridge().request<{ sessions: unknown[] }>('get', { ids });
        return sessions;
      },
      async ack(ids) {
        if (ids.length) await getBridge().request('ack', { ids });
      },
      resetPairing: () => Promise.reject(NOT_HERE('Pairing')),
      onChange: noop,
    },

    files: {
      openImportFile: () => (deps.pickFile ?? pickTextFile)(),
      async saveExport(defaultName, content, filters) {
        (deps.download ?? downloadText)(content, defaultName, mimeFor(filters, defaultName));
        return defaultName; // a browser download cannot be cancelled from the page
      },
    },

    shell: {
      async openExternal(url) {
        if (!/^https:\/\//.test(url)) throw new Error('Only https links can be opened.');
        if (deps.openUrl) deps.openUrl(url);
        else window.open(url, '_blank', 'noopener,noreferrer');
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
