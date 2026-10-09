/**
 * Moves sessions the extension pushed (inbox, written by the sync server) into the permanent store.
 * Order matters for durability: a session leaves the inbox only AFTER it is in the store, so a crash half way
 * costs nothing (the next run finds it in the inbox again and the store skips duplicates).
 */
import type { Session } from '@typelens/core/schema';
import { validateSession } from '@typelens/core/export';
import type { Inbox } from './inbox';
import type { SessionStore } from './sessionStore';

const CHUNK = 20;

export interface Ingester {
  /** Moves everything waiting in the inbox; resolves with the sessions that were newly stored. */
  drain(): Promise<Session[]>;
}

export function createIngester(inbox: Inbox, store: SessionStore, log: (...p: unknown[]) => void = () => undefined): Ingester {
  let chain: Promise<unknown> = Promise.resolve();

  async function run(): Promise<Session[]> {
    const added: Session[] = [];
    const ids = await inbox.list();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunkIds = ids.slice(i, i + CHUNK);
      const raw = await inbox.get(chunkIds);
      // an invalid file would be retried forever; it was already rejected once at the door, so set it aside
      const good: unknown[] = [];
      const bad: string[] = [];
      for (const s of raw) {
        const problem = validateSession(s);
        const id = (s as { id?: unknown } | null)?.id;
        if (!problem) good.push(s);
        else if (typeof id === 'string') {
          log('quarantining invalid inbox session:', problem);
          bad.push(id);
        }
      }
      await inbox.quarantine(bad);
      const r = await store.putMany(good);
      added.push(...r.added);
      // only what was actually read: a file that could not be read this time is kept for the next attempt
      await inbox.remove(good.map((s) => (s as { id: string }).id));
    }
    return added;
  }

  return {
    drain() {
      const next = chain.then(run, run);
      chain = next.catch(() => undefined);
      return next;
    },
  };
}
