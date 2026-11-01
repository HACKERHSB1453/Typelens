import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Session } from '@typelens/core/schema';
import { createDb, type Db } from '../src/db';
import { handleMessage, isExtensionPage, type HandlerDeps } from '../src/handlers';
import { createExtensionHost, type ExtensionHostDeps } from '../src/dashboard/host';

function session(id: string, startedAt: number, extra: Partial<Session> = {}): Session {
  return {
    v: 1,
    id,
    startedAt,
    source: 'monkeytype',
    config: { mode: 'time', mode2: '30', language: 'english', punctuation: false, numbers: false, funbox: [] },
    words: ['a'],
    keyEvents: [],
    inputEvents: [],
    completed: true,
    flags: [],
    result: { wpm: 70, rawWpm: 72, acc: 96, consistency: 80, testDurationSec: 30 },
    client: { extVersion: '0.1.0' },
    ...extra,
  };
}

describe('isExtensionPage', () => {
  it('accepts Chromium and Firefox extension pages', () => {
    expect(isExtensionPage('chrome-extension://abc/popup.html')).toBe(true);
    expect(isExtensionPage('moz-extension://0b1c-uuid/popup.html')).toBe(true);
  });
  it('rejects web pages and garbage', () => {
    expect(isExtensionPage('https://monkeytype.com/')).toBe(false);
    expect(isExtensionPage('http://localhost:5173/')).toBe(false);
    expect(isExtensionPage('not a url')).toBe(false);
    expect(isExtensionPage(undefined)).toBe(false);
  });
  it('checks the exact origin when it is known', () => {
    expect(isExtensionPage('moz-extension://mine/dashboard/index.html', 'moz-extension://mine/')).toBe(true);
    expect(isExtensionPage('moz-extension://other/popup.html', 'moz-extension://mine/')).toBe(false);
    expect(isExtensionPage('chrome-extension://mine/popup.html', 'moz-extension://mine/')).toBe(false);
  });
});

describe('db: dashboard writes', () => {
  let db: Db;
  beforeEach(() => {
    db = createDb(new IDBFactory(), `d-${Math.random()}`);
  });

  it('addMany stores only new ids, as seen, and keeps imported history away from the desktop push', async () => {
    await db.put(session('a', 1));
    const r = await db.addMany([session('a', 1), session('b', 2), session('h', 3, { source: 'monkeytype-history' })]);
    expect(r).toEqual({ added: 2, skipped: 1 });
    // a: recorded, unsynced, pending. b: imported recording, seen, pending. h: history, seen, never pushed
    expect(await db.count()).toEqual({ total: 3, unsynced: 1, pendingDesktop: 2 });
    expect((await db.pendingDesktop(10)).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('delete and markAllSynced', async () => {
    await db.put(session('a', 1));
    await db.put(session('b', 2));
    await db.markAllSynced();
    expect(await db.count()).toEqual({ total: 2, unsynced: 0, pendingDesktop: 2 });
    await db.delete('a');
    expect((await db.all()).map((s) => s.id)).toEqual(['b']);
  });
});

describe('dash:changed message', () => {
  let deps: HandlerDeps;
  let badge: string;
  let pushes: number;
  beforeEach(() => {
    badge = 'unset';
    pushes = 0;
    deps = {
      db: createDb(new IDBFactory(), `m-${Math.random()}`),
      extVersion: '1',
      setBadge: (t) => (badge = t),
      storage: { get: async () => ({}), set: async () => undefined },
      syncDesktop: async () => void pushes++,
      extensionOrigin: 'moz-extension://mine/',
    };
  });

  it('refreshes the badge, and pushes only when asked', async () => {
    await deps.db.put(session('a', 1));
    await handleMessage({ type: 'dash:changed' }, 'moz-extension://mine/dashboard/index.html', deps);
    expect(badge).toBe('1');
    expect(pushes).toBe(0);
    await handleMessage({ type: 'dash:changed', deliver: true }, 'moz-extension://mine/dashboard/index.html', deps);
    expect(pushes).toBe(1);
  });

  it('is refused from web pages and from another extension origin', async () => {
    await expect(handleMessage({ type: 'dash:changed' }, 'https://monkeytype.com/', deps)).rejects.toThrow('forbidden');
    await expect(handleMessage({ type: 'dash:changed' }, 'moz-extension://other/x.html', deps)).rejects.toThrow('forbidden');
  });
});

describe('extension dashboard host', () => {
  let db: Db;
  let notified: boolean[];
  let sessionsCb: (() => void) | null;
  let host: ReturnType<typeof createExtensionHost>;
  beforeEach(() => {
    db = createDb(new IDBFactory(), `h-${Math.random()}`);
    notified = [];
    sessionsCb = null;
    const mem = new Map<string, string>();
    const deps: ExtensionHostDeps = {
      db,
      version: '9.9.9',
      storageGet: async () => ({ mtTheme: { bg: '#111111', main: '#e2b714', sub: '#646669', subAlt: '#2c2e31', text: '#d1d0c5', error: '#ca4754', errorExtra: '#7e2a33', colorfulError: '#ca4754', colorfulErrorExtra: '#7e2a33' } }),
      notifyChanged: (deliver) => notified.push(deliver),
      onSessionsChanged: (cb) => ((sessionsCb = cb), () => (sessionsCb = null)),
      onThemeChanged: () => () => undefined,
      openTab: () => undefined,
      prefs: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) },
    };
    host = createExtensionHost(deps);
  });

  it('reads the recorder database directly and clears the badge when listing', async () => {
    expect(host.capabilities.builtInRecorder).toBe(true);
    expect(host.capabilities.extensionPush).toBe(false);
    await db.put(session('a', 1));
    expect((await host.sessions.list()).map((s) => s.id)).toEqual(['a']);
    expect((await db.count()).unsynced).toBe(0);
    expect(notified).toEqual([false]);
  });

  it('imports, deletes and clears through the same database', async () => {
    expect(await host.sessions.putMany([session('a', 1), session('b', 2)])).toEqual({ added: 2, skipped: 0 });
    expect(notified).toEqual([true]); // new tests: deliver to the desktop app too
    await host.sessions.delete('a');
    expect(await host.sessions.count()).toBe(1);
    await host.sessions.clear();
    expect(await host.sessions.count()).toBe(0);
  });

  it('forwards "a test was recorded" to the dashboard', () => {
    let fired = 0;
    const off = host.sessions.onChange(() => fired++);
    sessionsCb?.();
    expect(fired).toBe(1);
    off();
    expect(sessionsCb).toBeNull();
  });

  it('reports the extension as connected with nothing to pull, and keeps prefs', async () => {
    const st = await host.extension.status();
    expect(st.connected).toBe(true);
    expect(st.monkeytypeTheme?.main).toBe('#e2b714');
    expect(await host.extension.listPending()).toEqual({ fresh: [], known: [] });
    await host.prefs.set('typelens.source', 'mine');
    expect(await host.prefs.get('typelens.source')).toBe('mine');
    await host.prefs.set('typelens.source', null);
    expect(await host.prefs.get('typelens.source')).toBeNull();
  });

  it('opens only https links', async () => {
    await expect(host.shell.openExternal('javascript:alert(1)')).rejects.toThrow();
  });
});
