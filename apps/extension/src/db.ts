/**
 * Tiny IndexedDB wrapper (no libraries). One object store of Sessions keyed by id, with indexes on
 * startedAt (ordered sync), synced (0/1, drives the toolbar badge) and desktop (0/1, "not yet pushed to the
 * TypeLens desktop app"). The IDBFactory is injectable so tests can use fake-indexeddb.
 */
import type { Session } from '@typelens/core/schema';

/** desktop: 0 = pending, 1 = stored by the desktop app, 2 = rejected by it (never retried) */
type Stored = Session & { synced: 0 | 1; desktop: 0 | 1 | 2; desktopError?: string };

export interface Db {
  put(s: Session): Promise<void>;
  get(ids: string[]): Promise<Session[]>;
  /** ids of sessions with startedAt > after, ascending */
  listIds(after?: number): Promise<string[]>;
  /** mark synced; the data is KEPT */
  ack(ids: string[]): Promise<void>;
  /** sessions the desktop app has not confirmed yet, oldest first */
  pendingDesktop(limit: number): Promise<Session[]>;
  /** the desktop app stored these; also marks them synced so the badge clears */
  markDesktop(ids: string[]): Promise<void>;
  /** the desktop app refused these rows for a validation reason; they are never sent again */
  markRejected(items: { id: string; error: string }[]): Promise<void>;
  count(): Promise<{ total: number; unsynced: number; pendingDesktop: number }>;
  all(): Promise<Session[]>;
  last(): Promise<Session | null>;
  clear(): Promise<void>;
}

const STORE = 'sessions';
const DB_VERSION = 2;

function wrap<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function strip(s: Stored): Session {
  const { synced: _synced, desktop: _desktop, desktopError: _err, ...rest } = s;
  return rest;
}

export function createDb(factory: IDBFactory = indexedDB, name = 'typelens'): Db {
  let opened: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    opened ??= new Promise((resolve, reject) => {
      const req = factory.open(name, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const tx = req.transaction as IDBTransaction;
        let store: IDBObjectStore;
        if (e.oldVersion < 1) {
          store = req.result.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('startedAt', 'startedAt');
          store.createIndex('synced', 'synced');
        } else {
          store = tx.objectStore(STORE);
        }
        if (e.oldVersion < 2) {
          store.createIndex('desktop', 'desktop');
          // rows recorded before v2 never reached the desktop app: mark them all pending so the first
          // connection delivers the whole history
          store.openCursor().onsuccess = (ev) => {
            const cur = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
            if (!cur) return;
            cur.update({ ...cur.value, desktop: 0 });
            cur.continue();
          };
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return opened;
  };
  const store = async (mode: IDBTransactionMode): Promise<{ s: IDBObjectStore; tx: IDBTransaction }> => {
    const db = await open();
    const tx = db.transaction(STORE, mode);
    return { s: tx.objectStore(STORE), tx };
  };

  return {
    async put(session) {
      const { s, tx } = await store('readwrite');
      // a re-recorded session must be pushed again; the desktop app stores by id, so this is idempotent
      s.put({ ...session, synced: 0, desktop: 0 } satisfies Stored);
      await done(tx);
    },
    async get(ids) {
      const { s } = await store('readonly');
      const rows = await Promise.all(ids.map((id) => wrap(s.get(id) as IDBRequest<Stored | undefined>)));
      return rows.filter((r): r is Stored => !!r).map(strip);
    },
    async listIds(after = -Infinity) {
      const { s } = await store('readonly');
      const range = Number.isFinite(after) ? IDBKeyRange.lowerBound(after, true) : undefined;
      const rows = await wrap(s.index('startedAt').getAll(range) as IDBRequest<Stored[]>);
      return rows.map((r) => r.id);
    },
    async ack(ids) {
      const { s, tx } = await store('readwrite');
      for (const id of ids) {
        const row = (await wrap(s.get(id) as IDBRequest<Stored | undefined>)) ?? null;
        if (row) s.put({ ...row, synced: 1 });
      }
      await done(tx);
    },
    async pendingDesktop(limit) {
      const { s } = await store('readonly');
      const rows = await wrap(s.index('desktop').getAll(IDBKeyRange.only(0)) as IDBRequest<Stored[]>);
      // the index is ordered by primary key, so sort by time here
      return rows
        .sort((a, b) => a.startedAt - b.startedAt)
        .slice(0, Math.max(0, limit))
        .map(strip);
    },
    async markDesktop(ids) {
      const { s, tx } = await store('readwrite');
      for (const id of ids) {
        const row = (await wrap(s.get(id) as IDBRequest<Stored | undefined>)) ?? null;
        if (row) s.put({ ...row, desktop: 1, synced: 1 });
      }
      await done(tx);
    },
    async markRejected(items) {
      const { s, tx } = await store('readwrite');
      for (const { id, error } of items) {
        const row = (await wrap(s.get(id) as IDBRequest<Stored | undefined>)) ?? null;
        if (row) s.put({ ...row, desktop: 2, desktopError: error.slice(0, 500) });
      }
      await done(tx);
    },
    async count() {
      const { s } = await store('readonly');
      const [total, unsynced, pendingDesktop] = await Promise.all([
        wrap(s.count()),
        wrap(s.index('synced').count(IDBKeyRange.only(0))),
        wrap(s.index('desktop').count(IDBKeyRange.only(0))),
      ]);
      return { total, unsynced, pendingDesktop };
    },
    async all() {
      const { s } = await store('readonly');
      const rows = await wrap(s.index('startedAt').getAll() as IDBRequest<Stored[]>);
      return rows.map(strip);
    },
    async last() {
      const { s } = await store('readonly');
      return new Promise<Session | null>((resolve, reject) => {
        const req = s.index('startedAt').openCursor(null, 'prev');
        req.onsuccess = () => resolve(req.result ? strip(req.result.value as Stored) : null);
        req.onerror = () => reject(req.error);
      });
    },
    async clear() {
      const { s, tx } = await store('readwrite');
      s.clear();
      await done(tx);
    },
  };
}
