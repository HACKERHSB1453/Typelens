/** Small JSON preferences of the dashboard (data source choice, practice history) in <userData>/data/prefs.json. */
import fsp from 'node:fs/promises';
import { writeFileAtomic } from './fsutil';

export interface Prefs {
  get(key: string): Promise<unknown>;
  /** null removes the key */
  set(key: string, value: unknown): Promise<void>;
}

export function createPrefs(file: string): Prefs {
  let loaded: Promise<Record<string, unknown>> | null = null;
  const load = (): Promise<Record<string, unknown>> =>
    (loaded ??= fsp.readFile(file, 'utf8').then(
      (raw) => {
        try {
          const j: unknown = JSON.parse(raw);
          return j && typeof j === 'object' && !Array.isArray(j) ? { ...(j as Record<string, unknown>) } : {};
        } catch {
          return {}; // damaged file: start over rather than refuse to run
        }
      },
      () => ({}),
    ));
  let chain: Promise<unknown> = Promise.resolve();

  return {
    async get(key) {
      const all = await load();
      return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
    },
    set(key, value) {
      const run = chain.then(async () => {
        const all = await load();
        if (value === null || value === undefined) delete all[key];
        else all[key] = value;
        await writeFileAtomic(file, JSON.stringify(all));
      });
      chain = run.catch(() => undefined);
      return run;
    },
  };
}
