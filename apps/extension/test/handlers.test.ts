import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Session } from '@typelens/core/schema';
import { createDb, type Db } from '../src/db';
import { handleMessage, isSession, type HandlerDeps } from '../src/handlers';

const MT = 'https://monkeytype.com/';
const APP = 'http://localhost:5173/';
const EXT = 'chrome-extension://abcdef/popup.html';

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
    result: { wpm: 71.4, rawWpm: 73, acc: 96.2, consistency: 80, testDurationSec: 30 },
    client: { extVersion: '0.1.0' },
    ...extra,
  };
}

let db: Db;
let badge = '';
let store: Record<string, unknown>;
let deps: HandlerDeps;

beforeEach(() => {
  db = createDb(new IDBFactory(), `t-${Math.random()}`);
  badge = 'unset';
  store = {};
  deps = {
    db,
    extVersion: '0.1.0',
    setBadge: (t) => (badge = t),
    storage: {
      get: async (keys) => Object.fromEntries(keys.map((k) => [k, store[k]])),
      set: async (items) => void Object.assign(store, items),
    },
  };
});

describe('db', () => {
  it('stores, lists in startedAt order, gets by id, and keeps data after ack', async () => {
    await db.put(session('b', 2000));
    await db.put(session('a', 1000));
    await db.put(session('c', 3000));
    expect(await db.listIds()).toEqual(['a', 'b', 'c']);
    expect(await db.listIds(1000)).toEqual(['b', 'c']);
    expect(await db.count()).toEqual({ total: 3, unsynced: 3, pendingDesktop: 3 });
    await db.ack(['a', 'b']);
    expect(await db.count()).toEqual({ total: 3, unsynced: 1, pendingDesktop: 3 });
    const got = await db.get(['b', 'zzz']);
    expect(got.map((s) => s.id)).toEqual(['b']);
    expect('synced' in got[0]!).toBe(false); // internal flag never leaks
    expect((await db.last())?.id).toBe('c');
    await db.clear();
    expect((await db.count()).total).toBe(0);
  });
});

describe('handleMessage authorisation', () => {
  it('accepts sessions only from monkeytype.com and validates their shape', async () => {
    await expect(handleMessage({ type: 'session', session: session('s1', 1) }, MT, deps)).resolves.toEqual({ ok: true });
    expect(badge).toBe('1');
    await expect(handleMessage({ type: 'session', session: session('s2', 2) }, APP, deps)).rejects.toThrow('forbidden');
    await expect(handleMessage({ type: 'session', session: session('s2', 2) }, 'https://evil.example/', deps)).rejects.toThrow('forbidden');
    await expect(handleMessage({ type: 'session', session: session('s2', 2) }, undefined, deps)).rejects.toThrow('forbidden');
    await expect(handleMessage({ type: 'session', session: { nope: true } as unknown as Session }, MT, deps)).rejects.toThrow('invalid session');
    expect((await db.count()).total).toBe(1);
  });

  it('sync:* is only allowed for the web-app origins', async () => {
    await db.put(session('s1', 1));
    for (const bad of [MT, 'https://evil.example/', undefined, EXT]) {
      await expect(handleMessage({ type: 'sync:ping' }, bad, deps)).rejects.toThrow('forbidden');
      await expect(handleMessage({ type: 'sync:list' }, bad, deps)).rejects.toThrow('forbidden');
      await expect(handleMessage({ type: 'sync:get', ids: ['s1'] }, bad, deps)).rejects.toThrow('forbidden');
      await expect(handleMessage({ type: 'sync:ack', ids: ['s1'] }, bad, deps)).rejects.toThrow('forbidden');
    }
    await expect(handleMessage({ type: 'sync:ping' }, APP, deps)).resolves.toEqual({ ok: true, version: '0.1.0', recorderSeenAt: null, health: null, theme: null });
    store.recorderSeenAt = 123;
    await expect(handleMessage({ type: 'sync:ping' }, APP, deps)).resolves.toMatchObject({ recorderSeenAt: 123 });
    const theme = { name: 'nord', bg: '#2e3440', main: '#88c0d0', sub: '#7b88a1', subAlt: '#3b4252', text: '#eceff4', error: '#bf616a' };
    store.mtTheme = theme;
    await expect(handleMessage({ type: 'sync:ping' }, APP, deps)).resolves.toMatchObject({ theme });
    await expect(handleMessage({ type: 'sync:ping' }, 'http://127.0.0.1:5173/x', deps)).resolves.toMatchObject({ ok: true });
  });

  it('runs the full sync protocol: list -> get (batched) -> ack, keeping the data', async () => {
    for (let i = 1; i <= 25; i++) await db.put(session(`s${String(i).padStart(2, '0')}`, i * 1000));
    const { ids } = (await handleMessage({ type: 'sync:list' }, APP, deps)) as { ids: string[] };
    expect(ids).toHaveLength(25);
    const { sessions } = (await handleMessage({ type: 'sync:get', ids }, APP, deps)) as { sessions: Session[] };
    expect(sessions).toHaveLength(20); // SYNC_BATCH cap
    await handleMessage({ type: 'sync:ack', ids: sessions.map((s) => s.id) }, APP, deps);
    expect(badge).toBe('5');
    expect((await db.count()).total).toBe(25); // still stored
  });

  it('popup, export and clear are for extension pages only; clear needs the DELETE confirmation', async () => {
    await db.put(session('s1', 1));
    await expect(handleMessage({ type: 'popup:state' }, APP, deps)).rejects.toThrow('forbidden');
    await expect(handleMessage({ type: 'export' }, MT, deps)).rejects.toThrow('forbidden');
    await expect(handleMessage({ type: 'clear', confirm: 'DELETE' }, APP, deps)).rejects.toThrow('forbidden');
    const st = (await handleMessage({ type: 'popup:state' }, EXT, deps)) as { total: number; unsynced: number; paused: boolean; last: { wpm: number } };
    expect(st).toMatchObject({ total: 1, unsynced: 1, paused: false, last: { wpm: 71.4 } });
    const exported = JSON.parse((await handleMessage({ type: 'export' }, EXT, deps)) as string) as { v: number; sessions: Session[] };
    expect(exported.v).toBe(1);
    expect(exported.sessions).toHaveLength(1);
    await expect(handleMessage({ type: 'clear', confirm: 'yes' }, EXT, deps)).rejects.toThrow('confirmation required');
    expect((await db.count()).total).toBe(1);
    await handleMessage({ type: 'clear', confirm: 'DELETE' }, EXT, deps);
    expect((await db.count()).total).toBe(0);
    expect(badge).toBe('');
  });
});

describe('isSession', () => {
  it('rejects malformed input', () => {
    expect(isSession(session('x', 1))).toBe(true);
    expect(isSession(null)).toBe(false);
    expect(isSession({ ...session('x', 1), v: 2 })).toBe(false);
    expect(isSession({ ...session('x', 1), source: 'other' })).toBe(false);
    expect(isSession({ ...session('x', 1), keyEvents: 'no' })).toBe(false);
    expect(isSession({ ...session('x', 1), id: '' })).toBe(false);
  });
});
