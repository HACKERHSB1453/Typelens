/**
 * The desktop app's own database of sessions: one plain JSON file per session under <userData>/data/sessions.
 * Plain files on purpose: the data is easy to back up, inspect and move, and a damaged file can only ever
 * lose one session. Every session is validated with the same rules as a file import before it is written.
 */
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Session } from '@typelens/core/schema';
import { validateSession } from '@typelens/core/export';
import { removeStaleTmp, writeFileAtomic } from './fsutil';

export interface SessionStore {
  list(): Promise<Session[]>;
  putMany(sessions: unknown[]): Promise<{ added: Session[]; skipped: number }>;
  has(id: string): Promise<boolean>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  count(): Promise<number>;
}

/** Session ids come from outside; encode them so no id can name a path outside the folder (and stay under
 * Windows' 255-character file name limit: long ids fall back to a hash). */
export function fileOf(id: string): string {
  const hex = Buffer.from(id, 'utf8').toString('hex');
  return hex.length <= 120 ? `${hex}.json` : `h${crypto.createHash('sha256').update(id).digest('hex')}.json`;
}

export function createSessionStore(dir: string, onProblem: (msg: string, err?: unknown) => void = () => undefined): SessionStore {
  let ready: Promise<void> | null = null;
  const ensure = (): Promise<void> => (ready ??= fsp.mkdir(dir, { recursive: true }).then(() => removeStaleTmp(dir)));
  // writes and deletes run one at a time so "does it exist?" followed by "write it" cannot race
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };
  const jsonFiles = async (): Promise<string[]> => {
    await ensure();
    return (await fsp.readdir(dir)).filter((f) => f.endsWith('.json'));
  };
  const exists = (file: string): Promise<boolean> =>
    fsp.access(path.join(dir, file)).then(
      () => true,
      () => false,
    );

  return {
    async list() {
      const out: Session[] = [];
      const files = await jsonFiles();
      for (let i = 0; i < files.length; i += 64) {
        const chunk = await Promise.all(
          files.slice(i, i + 64).map(async (f) => {
            try {
              const s: unknown = JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8'));
              const problem = validateSession(s);
              if (problem) {
                onProblem(`ignoring ${f}: ${problem}`);
                return null;
              }
              return s as Session;
            } catch (err) {
              onProblem(`cannot read ${f}`, err);
              return null;
            }
          }),
        );
        for (const s of chunk) if (s) out.push(s);
      }
      return out;
    },
    putMany(sessions) {
      // validate everything first so a bad batch stores nothing
      for (const s of sessions) {
        const problem = validateSession(s);
        if (problem) return Promise.reject(new Error(`invalid session: ${problem}`));
      }
      return serial(async () => {
        await ensure();
        const added: Session[] = [];
        let skipped = 0;
        for (const s of sessions as Session[]) {
          const file = fileOf(s.id);
          if (await exists(file)) skipped++;
          else {
            await writeFileAtomic(path.join(dir, file), JSON.stringify(s));
            added.push(s);
          }
        }
        return { added, skipped };
      });
    },
    async has(id) {
      await ensure();
      return exists(fileOf(id));
    },
    delete: (id) =>
      serial(async () => {
        await ensure();
        await fsp.rm(path.join(dir, fileOf(id)), { force: true });
      }),
    clear: () =>
      serial(async () => {
        await Promise.all((await jsonFiles()).map((f) => fsp.rm(path.join(dir, f), { force: true })));
      }),
    async count() {
      return (await jsonFiles()).length;
    },
  };
}
