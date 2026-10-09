/**
 * Durable queue between the sync server (main process) and the dashboard (renderer).
 *
 * The server writes every session it accepts here BEFORE telling the extension it was delivered, and the
 * dashboard deletes a session from here only AFTER it is in the dashboard's own database. So a session is
 * never lost if the app is closed (or crashes) half way. One file per session, written atomically.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { removeStaleTmp, writeFileAtomic } from './fsutil';

export interface Inbox {
  /** stores the sessions (overwriting the same id); returns their ids */
  put(sessions: { id: string }[]): Promise<string[]>;
  /** ids currently waiting, oldest file first */
  list(): Promise<string[]>;
  get(ids: string[]): Promise<unknown[]>;
  remove(ids: string[]): Promise<void>;
  /** moves files that can never be imported into <inbox>/quarantine/ (kept for inspection, never retried) */
  quarantine(ids: string[]): Promise<void>;
}

/** Session ids come from outside; hex-encode them so no id can name a path outside the inbox. */
const fileOf = (id: string): string => `${Buffer.from(id, 'utf8').toString('hex')}.json`;
const idOf = (file: string): string | null => {
  const m = /^([0-9a-f]+)\.json$/.exec(file);
  return m ? Buffer.from(m[1]!, 'hex').toString('utf8') : null;
};

export function createInbox(dir: string, onProblem: (msg: string, err?: unknown) => void = () => undefined): Inbox {
  let ready: Promise<void> | null = null;
  const ensure = (): Promise<void> => (ready ??= fs.mkdir(dir, { recursive: true }).then(() => removeStaleTmp(dir)));

  return {
    async put(sessions) {
      await ensure();
      const ids: string[] = [];
      for (const s of sessions) {
        // atomic (readers see the old file or the complete new one); retries the rename Windows refuses while the
        // ingester is reading the same id, and never leaves its temp file behind on failure
        await writeFileAtomic(path.join(dir, fileOf(s.id)), JSON.stringify(s));
        ids.push(s.id);
      }
      return ids;
    },
    async list() {
      await ensure();
      const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));
      const withTime = await Promise.all(
        files.map(async (f) => ({ f, t: (await fs.stat(path.join(dir, f)).catch(() => null))?.mtimeMs ?? 0 })),
      );
      return withTime
        .sort((a, b) => a.t - b.t)
        .map((x) => idOf(x.f))
        .filter((id): id is string => id !== null);
    },
    async get(ids) {
      await ensure();
      const out: unknown[] = [];
      for (const id of ids) {
        let text: string;
        try {
          text = await fs.readFile(path.join(dir, fileOf(id)), 'utf8');
        } catch {
          continue; // gone (already imported) or not readable right now: leave it for the next attempt
        }
        try {
          out.push(JSON.parse(text));
        } catch (err) {
          onProblem(`inbox file for ${id.slice(0, 40)} is not valid JSON; quarantined`, err);
          await this.quarantine([id]);
        }
      }
      return out;
    },
    async quarantine(ids) {
      if (ids.length === 0) return;
      await ensure();
      const q = path.join(dir, 'quarantine');
      await fs.mkdir(q, { recursive: true });
      for (const id of ids) {
        const file = fileOf(id);
        await fs.rename(path.join(dir, file), path.join(q, file)).catch(() => undefined);
      }
    },
    async remove(ids) {
      await ensure();
      await Promise.all(ids.map((id) => fs.rm(path.join(dir, fileOf(id)), { force: true })));
    },
  };
}
