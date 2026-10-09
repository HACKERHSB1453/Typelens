/** Atomic file writes: readers see the old file or the complete new one, never half a file. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const tmpName = (file: string): string => `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** Windows can refuse a rename while antivirus/indexers hold the target for a moment, so retry briefly. */
async function renameRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fsp.rename(from, to);
      return;
    } catch (err) {
      if (attempt >= 5 || !RETRYABLE.has((err as NodeJS.ErrnoException).code ?? '')) {
        await fsp.rm(from, { force: true });
        throw err;
      }
      await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
    }
  }
}

export async function writeFileAtomic(file: string, data: string): Promise<void> {
  const tmp = tmpName(file);
  await fsp.writeFile(tmp, data);
  await renameRetry(tmp, file);
}

export function writeFileAtomicSync(file: string, data: string): void {
  const tmp = tmpName(file);
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/** Temp files of writes that were cut short (crash, power loss, full disk). Only call before anything writes to `dir`. */
export async function removeStaleTmp(dir: string): Promise<void> {
  const names = await fsp.readdir(dir).catch(() => [] as string[]);
  await Promise.all(names.filter((f) => f.endsWith('.tmp')).map((f) => fsp.rm(path.join(dir, f), { force: true }).catch(() => undefined)));
}
