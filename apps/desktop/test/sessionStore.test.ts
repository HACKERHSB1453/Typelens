import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSessionStore, fileOf } from '../src/sessionStore';
import { session, tmpDir } from './helpers';

const dirs: string[] = [];
const fresh = (): string => {
  const root = tmpDir();
  dirs.push(root);
  return path.join(root, 'sessions');
};
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('file session store', () => {
  it('adds sessions once (idempotent by id) and counts them', async () => {
    const store = createSessionStore(fresh());
    expect(await store.count()).toBe(0);
    const first = await store.putMany([session('a'), session('b')]);
    expect(first.added.map((s) => s.id)).toEqual(['a', 'b']);
    expect(first.skipped).toBe(0);
    const again = await store.putMany([session('a'), session('c')]);
    expect(again.added.map((s) => s.id)).toEqual(['c']);
    expect(again.skipped).toBe(1);
    expect(await store.count()).toBe(3);
  });

  it('skips a duplicate id inside one batch', async () => {
    const store = createSessionStore(fresh());
    const r = await store.putMany([session('a'), session('a')]);
    expect(r.added).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });

  it('writes plain one-file-per-session JSON and lists them back unchanged', async () => {
    const dir = fresh();
    const store = createSessionStore(dir);
    const s = session('mt-1');
    await store.putMany([s]);
    const files = fs.readdirSync(dir);
    expect(files).toEqual([fileOf('mt-1')]);
    expect(JSON.parse(fs.readFileSync(path.join(dir, files[0]!), 'utf8')).id).toBe('mt-1');
    expect(await store.list()).toEqual([s]);
  });

  it('rejects invalid sessions and stores nothing from that batch', async () => {
    const store = createSessionStore(fresh());
    await expect(store.putMany([session('ok'), { id: 'bad' }])).rejects.toThrow(/invalid session/);
    expect(await store.count()).toBe(0);
  });

  it('deletes one session and clears all', async () => {
    const store = createSessionStore(fresh());
    await store.putMany([session('a'), session('b'), session('c')]);
    await store.delete('b');
    expect(await store.has('b')).toBe(false);
    expect(await store.count()).toBe(2);
    await store.clear();
    expect(await store.count()).toBe(0);
    expect(await store.list()).toEqual([]);
  });

  it('skips damaged files when listing and reports them', async () => {
    const dir = fresh();
    const problems: string[] = [];
    const store = createSessionStore(dir, (m) => problems.push(m));
    await store.putMany([session('a')]);
    fs.writeFileSync(path.join(dir, 'zz.json'), '{ not json');
    expect((await store.list()).map((s) => s.id)).toEqual(['a']);
    expect(problems.join()).toMatch(/zz\.json/);
  });

  it('keeps hostile or very long ids inside the folder and under the file-name limit', async () => {
    const dir = fresh();
    const store = createSessionStore(dir);
    const long = 'x'.repeat(400);
    await store.putMany([session('../../evil'), session(long)]);
    expect(fs.readdirSync(dir).every((f) => f.length < 200 && !f.includes('..'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '..', '..', 'evil.json'))).toBe(false);
    expect(await store.has(long)).toBe(true);
  });

  it('survives concurrent writes of the same id', async () => {
    const store = createSessionStore(fresh());
    const results = await Promise.all(Array.from({ length: 8 }, () => store.putMany([session('same')])));
    expect(results.reduce((n, r) => n + r.added.length, 0)).toBe(1);
    expect(await store.count()).toBe(1);
  });
});
