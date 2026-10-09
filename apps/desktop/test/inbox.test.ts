import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createInbox } from '../src/inbox';
import { session, tmpDir } from './helpers';

const dirs: string[] = [];
const fresh = (): string => {
  const d = tmpDir();
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('inbox leftovers', () => {
  it('removes temp files of interrupted writes', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'abcd.json.123.deadbeef.tmp'), 'half');
    fs.writeFileSync(path.join(dir, `${Buffer.from('keep').toString('hex')}.json`), JSON.stringify({ id: 'keep' }));
    const inbox = createInbox(dir);
    expect(await inbox.list()).toEqual(['keep']);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('inbox', () => {
  it('stores one file per session and reads them back', async () => {
    const dir = path.join(fresh(), 'inbox');
    const inbox = createInbox(dir);
    expect(await inbox.list()).toEqual([]);
    await inbox.put([session('a'), session('b')]);
    expect((await inbox.list()).sort()).toEqual(['a', 'b']);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.json'))).toHaveLength(2);
    const got = (await inbox.get(['a'])) as { id: string }[];
    expect(got[0]?.id).toBe('a');
  });

  it('overwrites the same id instead of duplicating, and leaves no temp files', async () => {
    const dir = path.join(fresh(), 'inbox');
    const inbox = createInbox(dir);
    await inbox.put([session('a')]);
    await inbox.put([session('a')]);
    expect(await inbox.list()).toEqual(['a']);
    expect(fs.readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('removes sessions and ignores unknown ids', async () => {
    const inbox = createInbox(path.join(fresh(), 'inbox'));
    await inbox.put([session('a'), session('b')]);
    await inbox.remove(['a', 'missing']);
    expect(await inbox.list()).toEqual(['b']);
    expect(await inbox.get(['a'])).toEqual([]);
  });

  it('cannot be tricked into touching paths outside the inbox through an id', async () => {
    const root = fresh();
    const inbox = createInbox(path.join(root, 'inbox'));
    await inbox.put([session('../../escape')]);
    expect(fs.existsSync(path.join(root, 'escape.json'))).toBe(false);
    expect(await inbox.list()).toEqual(['../../escape']);
  });
});
