import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeSession, repeatWords, type Session } from '@typelens/core';

/** a valid recorded session */
export const session = (id: string, startedAt = 1_700_000_000_000): Session => makeSession({ id, startedAt, text: repeatWords('the cat sat', 6) });

export function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'typelens-test-'));
}
