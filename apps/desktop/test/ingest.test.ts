import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createIngester } from '../src/ingest';
import { createInbox } from '../src/inbox';
import { createSessionStore } from '../src/sessionStore';
import { session, tmpDir } from './helpers';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function setup() {
  const root = tmpDir();
  dirs.push(root);
  const inbox = createInbox(path.join(root, 'inbox'));
  const store = createSessionStore(path.join(root, 'sessions'));
  return { inbox, store, ingester: createIngester(inbox, store) };
}

describe('inbox -> store ingest', () => {
  it('moves pushed sessions into the store and empties the inbox', async () => {
    const { inbox, store, ingester } = setup();
    await inbox.put([session('a'), session('b')]);
    const added = await ingester.drain();
    expect(added.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(await store.count()).toBe(2);
    expect(await inbox.list()).toEqual([]);
  });

  it('does not report sessions the store already had as new', async () => {
    const { inbox, store, ingester } = setup();
    await store.putMany([session('a')]);
    await inbox.put([session('a'), session('b')]);
    expect((await ingester.drain()).map((s) => s.id)).toEqual(['b']);
    expect(await inbox.list()).toEqual([]);
  });

  it('is safe to call concurrently (each session is reported once)', async () => {
    const { inbox, ingester } = setup();
    await inbox.put(Array.from({ length: 45 }, (_, i) => session(`s${i}`, 1_700_000_000_000 + i)));
    const all = (await Promise.all([ingester.drain(), ingester.drain(), ingester.drain()])).flat();
    expect(all).toHaveLength(45);
  });

  it('drops an invalid inbox file instead of blocking the queue', async () => {
    const { inbox, store, ingester } = setup();
    await inbox.put([session('good'), { id: 'bad' }]);
    expect((await ingester.drain()).map((s) => s.id)).toEqual(['good']);
    expect(await store.count()).toBe(1);
    expect(await inbox.list()).toEqual([]);
    expect(fs.readdirSync(path.join(dirs[0]!, 'inbox', 'quarantine'))).toHaveLength(1);
  });

  it('quarantines a file that is not JSON instead of retrying it forever', async () => {
    const { inbox, ingester } = setup();
    await inbox.put([session('good')]);
    fs.writeFileSync(path.join(dirs[0]!, 'inbox', `${Buffer.from('broken').toString('hex')}.json`), '{ not json');
    expect((await ingester.drain()).map((s) => s.id)).toEqual(['good']);
    expect(await inbox.list()).toEqual([]);
    expect(fs.readdirSync(path.join(dirs[0]!, 'inbox', 'quarantine'))).toHaveLength(1);
  });
});
