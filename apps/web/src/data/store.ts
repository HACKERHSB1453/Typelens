/**
 * The web app's own IndexedDB store of Sessions (separate from the extension's, which is only a
 * capture buffer). Everything stays in this browser.
 */
import type { Session } from '@typelens/core';

export interface SessionStore {
  /** inserts sessions whose id is not stored yet; existing ids are skipped (import/sync is idempotent) */
  putMany(sessions: Session[]): Promise<{ added: number; skipped: number }>;
  all(): Promise<Session[]>;
  has(id: string): Promise<boolean>;
  count(): Promise<number>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

const STORE = 'sessions';

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

export function createStore(factory: IDBFactory = indexedDB, name = 'typelens-web'): SessionStore {
  let opened: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    opened ??= new Promise((resolve, reject) => {
      const req = factory.open(name, 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('startedAt', 'startedAt');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return opened;
  };
  const tx = async (mode: IDBTransactionMode): Promise<{ s: IDBObjectStore; t: IDBTransaction }> => {
    const t = (await open()).transaction(STORE, mode);
    return { s: t.objectStore(STORE), t };
  };

  return {
    async putMany(sessions) {
      const { s, t } = await tx('readwrite');
      let added = 0;
      let skipped = 0;
      for (const session of sessions) {
        const req = s.add(session);
        req.onsuccess = () => void added++;
        req.onerror = (e) => {
          e.preventDefault(); // a ConstraintError (id already stored) must not abort the whole batch
          e.stopPropagation();
          skipped++;
        };
      }
      await done(t);
      return { added, skipped };
    },
    async all() {
      const { s } = await tx('readonly');
      return wrap(s.index('startedAt').getAll() as IDBRequest<Session[]>);
    },
    async has(id) {
      const { s } = await tx('readonly');
      return (await wrap(s.count(IDBKeyRange.only(id)))) > 0;
    },
    async count() {
      const { s } = await tx('readonly');
      return wrap(s.count());
    },
    async delete(id) {
      const { s, t } = await tx('readwrite');
      s.delete(id);
      await done(t);
    },
    async clear() {
      const { s, t } = await tx('readwrite');
      s.clear();
      await done(t);
    },
  };
}
