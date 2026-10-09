import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Session } from '@typelens/core/schema';
import { createDb } from '../src/db';

function session(id: string, startedAt: number): Session {
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
  };
}

/** Creates a database exactly as version 1 of the extension did (no desktop field, no desktop index). */
function createV1(factory: IDBFactory, name: string, rows: Array<Record<string, unknown>>): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('sessions', { keyPath: 'id' });
      store.createIndex('startedAt', 'startedAt');
      store.createIndex('synced', 'synced');
      for (const r of rows) store.put(r);
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

describe('db desktop delivery', () => {
  it('v1 -> v2 upgrade marks every existing row as not yet pushed to the desktop app', async () => {
    const factory = new IDBFactory();
    const name = 'upgrade';
    await createV1(factory, name, [
      { ...session('old-b', 2000), synced: 1 },
      { ...session('old-a', 1000), synced: 0 },
    ]);
    const db = createDb(factory, name);
    expect((await db.pendingDesktop(10)).map((s) => s.id)).toEqual(['old-a', 'old-b']);
    expect(await db.count()).toEqual({ total: 2, unsynced: 1, pendingDesktop: 2 });
  });

  it('pendingDesktop is oldest-first and limited; markDesktop clears pending and the badge count', async () => {
    const db = createDb(new IDBFactory(), `t-${Math.random()}`);
    await db.put(session('c', 3000));
    await db.put(session('a', 1000));
    await db.put(session('b', 2000));
    expect((await db.pendingDesktop(2)).map((s) => s.id)).toEqual(['a', 'b']);
    await db.markDesktop(['a']);
    expect((await db.pendingDesktop(10)).map((s) => s.id)).toEqual(['b', 'c']);
    expect(await db.count()).toEqual({ total: 3, unsynced: 2, pendingDesktop: 2 });
    const got = await db.get(['a']);
    expect('desktop' in got[0]!).toBe(false); // internal flag never leaks
  });

  it('put() makes a session pending again, even if it was delivered before', async () => {
    const db = createDb(new IDBFactory(), `t-${Math.random()}`);
    await db.put(session('a', 1000));
    await db.markDesktop(['a']);
    await db.put(session('a', 1000));
    expect((await db.pendingDesktop(10)).map((s) => s.id)).toEqual(['a']);
    expect((await db.count()).unsynced).toBe(1);
  });

  it('markRejected removes rows from pending and from the pending count, and never leaks its fields', async () => {
    const db = createDb(new IDBFactory(), `t-${Math.random()}`);
    await db.put(session('a', 1000));
    await db.put(session('b', 2000));
    await db.markRejected([{ id: 'a', error: 'bad shape' }]);
    expect((await db.pendingDesktop(10)).map((s) => s.id)).toEqual(['b']);
    expect(await db.count()).toEqual({ total: 2, unsynced: 2, pendingDesktop: 1 });
    const got = await db.get(['a']);
    expect(got[0]).toEqual(session('a', 1000)); // no desktop / desktopError / synced fields
    expect('desktopError' in got[0]!).toBe(false);
  });
});
