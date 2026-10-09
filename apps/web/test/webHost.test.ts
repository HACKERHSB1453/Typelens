import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { makeSession, repeatWords } from '@typelens/core';
import { PREF_SOURCE } from '@typelens/host-contract';
import { createStore } from '../src/data/store';
import type { Bridge, BridgeAction } from '../src/data/bridge';
import { createWebHost, type PrefStorage } from '../src/host/webHost';
import { getHost, setHostForTests } from '../src/host/current';

const s = (id: string, at = 1_700_000_000_000) => makeSession({ id, startedAt: at, text: repeatWords('the cat sat', 6) });

function memStorage(initial: Record<string, string> = {}): PrefStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

/** a bridge whose extension holds `held` and records acks */
function fakeBridge(held: string[], opts: { alive?: boolean } = {}): Bridge & { acked: string[]; asked: string[][] } {
  const acked: string[] = [];
  const asked: string[][] = [];
  const request = (async (action: BridgeAction, payload?: { ids?: string[] }) => {
    if (action === 'list') return { ids: held };
    if (action === 'get') {
      asked.push(payload?.ids ?? []);
      return { sessions: (payload?.ids ?? []).map((id) => s(id)) };
    }
    if (action === 'ack') {
      acked.push(...(payload?.ids ?? []));
      return {};
    }
    return { ok: opts.alive ?? true };
  }) as Bridge['request'];
  return { request, ping: async () => opts.alive ?? true, acked, asked };
}

let store: ReturnType<typeof createStore>;
beforeEach(() => {
  store = createStore(new IDBFactory(), `host-${Math.random()}`);
});

describe('web host', () => {
  it('identifies as a web host with (almost) no native capabilities and no updates', async () => {
    const host = createWebHost({ store, bridge: fakeBridge([]), storage: null });
    expect(host.kind).toBe('web');
    expect(Object.values(host.capabilities).every((v) => v === false)).toBe(true);
    expect((await host.updates.state()).status).toBe('unsupported');
    expect((await host.updates.check()).status).toBe('unsupported');
    await expect(host.updates.installAndRestart()).rejects.toThrow();
    expect(await host.settings.getStartAtLogin()).toBe(false);
    await expect(host.settings.setStartAtLogin(true)).rejects.toThrow(/desktop/);
    expect(await host.app.info()).toMatchObject({ name: 'TypeLens', platform: 'web', dataDir: null });
  });

  it('stores sessions in IndexedDB idempotently by id', async () => {
    const host = createWebHost({ store, bridge: fakeBridge([]), storage: null });
    expect(await host.sessions.putMany([s('a'), s('b')])).toEqual({ added: 2, skipped: 0 });
    expect(await host.sessions.putMany([s('a'), s('c')])).toEqual({ added: 1, skipped: 1 });
    expect(await host.sessions.count()).toBe(3);
    expect((await host.sessions.list()).map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
    await host.sessions.delete('b');
    expect(await host.sessions.count()).toBe(2);
    await host.sessions.clear();
    expect(await host.sessions.count()).toBe(0);
  });

  it('keeps preferences as JSON, reads values written by older versions, and removes with null', async () => {
    const storage = memStorage({ [PREF_SOURCE]: 'demo', 'typelens.practice.history': '[{"text":"a"}]' });
    const host = createWebHost({ store, bridge: fakeBridge([]), storage });
    expect(await host.prefs.get(PREF_SOURCE)).toBe('demo'); // legacy raw string
    expect(await host.prefs.get('typelens.practice.history')).toEqual([{ text: 'a' }]);
    expect(await host.prefs.get('missing')).toBeNull();
    await host.prefs.set(PREF_SOURCE, 'mine');
    expect(storage.data.get(PREF_SOURCE)).toBe('"mine"');
    expect(await host.prefs.get(PREF_SOURCE)).toBe('mine');
    await host.prefs.set(PREF_SOURCE, null);
    expect(storage.data.has(PREF_SOURCE)).toBe(false);
    expect(await host.prefs.get(PREF_SOURCE)).toBeNull();
  });

  it('falls back to memory when storage is missing or throws', async () => {
    const none = createWebHost({ store, bridge: fakeBridge([]), storage: null });
    await none.prefs.set('k', { a: 1 });
    expect(await none.prefs.get('k')).toEqual({ a: 1 });
    const broken: PrefStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const host = createWebHost({ store, bridge: fakeBridge([]), storage: broken });
    expect(await host.prefs.get('x')).toBeNull();
    await host.prefs.set('x', 5);
    expect(await host.prefs.get('x')).toBe(5);
  });

  it('extension: status is the bridge ping; pending splits already-stored ids from fresh ones', async () => {
    const bridge = fakeBridge(['a', 'b', 'c']);
    const host = createWebHost({ store, bridge, storage: null });
    expect(await host.extension.status()).toMatchObject({ transport: 'bridge', connected: true, endpoint: null, paired: null, extensionFolder: null });
    await host.sessions.putMany([s('a')]);
    expect(await host.extension.listPending()).toEqual({ fresh: ['b', 'c'], known: ['a'] });
    const pulled = (await host.extension.pullPending(['b'])) as { id: string }[];
    expect(pulled.map((x) => x.id)).toEqual(['b']);
    await host.extension.ack(['a', 'b']);
    expect(bridge.acked).toEqual(['a', 'b']);
    await host.extension.ack([]); // nothing to say: no request
    expect(bridge.acked).toHaveLength(2);
    await expect(host.extension.resetPairing()).rejects.toThrow();
  });

  it('extension: a dead bridge reads as not connected', async () => {
    const host = createWebHost({ store, bridge: fakeBridge([], { alive: false }), storage: null });
    expect((await host.extension.status()).connected).toBe(false);
  });

  it('files: exports go through the download fallback; imports through the picker', async () => {
    const saved: { content: string; name: string; mime: string }[] = [];
    const host = createWebHost({
      store,
      bridge: fakeBridge([]),
      storage: null,
      download: (content, name, mime) => void saved.push({ content, name, mime }),
      pickFile: async () => ({ name: 'x.json', text: '{}' }),
    });
    expect(await host.files.saveExport('typelens-sessions.csv', 'a,b', [{ name: 'CSV', extensions: ['csv'] }])).toBe('typelens-sessions.csv');
    expect(saved).toEqual([{ content: 'a,b', name: 'typelens-sessions.csv', mime: 'text/csv' }]);
    await host.files.saveExport('e.json', '{}', []);
    expect(saved[1]?.mime).toBe('application/json');
    expect(await host.files.openImportFile()).toEqual({ name: 'x.json', text: '{}' });
  });

  it('shell: only https links, nothing that needs a desktop shell', async () => {
    const opened: string[] = [];
    const host = createWebHost({ store, bridge: fakeBridge([]), storage: null, openUrl: (u) => void opened.push(u) });
    await host.shell.openExternal('https://github.com/x/y');
    await expect(host.shell.openExternal('http://example.com')).rejects.toThrow();
    await expect(host.shell.openExternal('javascript:alert(1)')).rejects.toThrow();
    expect(opened).toEqual(['https://github.com/x/y']);
    await expect(host.shell.openDataFolder()).rejects.toThrow();
    await expect(host.shell.openExtensionFolder()).rejects.toThrow();
  });

  it('subscriptions return an unsubscribe function', () => {
    const host = createWebHost({ store, bridge: fakeBridge([]), storage: null });
    for (const off of [host.sessions.onChange(() => undefined), host.extension.onChange(() => undefined), host.updates.onChange(() => undefined), host.onNavigate(() => undefined), host.onMenuAction(() => undefined)]) {
      expect(typeof off).toBe('function');
      off();
    }
  });
});

describe('getHost', () => {
  it('prefers a host installed by the desktop preload, and caches', () => {
    const fake = createWebHost({ store, bridge: fakeBridge([]), storage: null });
    setHostForTests(null);
    (globalThis as { window?: unknown }).window = { typelensHost: fake };
    try {
      expect(getHost()).toBe(fake);
      expect(getHost()).toBe(fake);
    } finally {
      delete (globalThis as { window?: unknown }).window;
      setHostForTests(null);
    }
  });
  it('builds the web host when nothing was injected', () => {
    setHostForTests(null);
    expect(getHost().kind).toBe('web');
    setHostForTests(null);
  });
});
