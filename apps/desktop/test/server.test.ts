import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { DESKTOP_API, DESKTOP_HELLO_PATH, DESKTOP_HOST, DESKTOP_SESSIONS_PATH } from '@typelens/core/desktop';
import { createInbox, type Inbox } from '../src/inbox';
import { createSyncServer, type ExtensionState, type SyncServer } from '../src/server';
import { session, tmpDir } from './helpers';

const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop';
const EXT = `chrome-extension://${EXT_ID}`;
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanup.splice(0).reverse()) await c();
});

async function boot(opts: { paired?: string | null } = {}) {
  const root = tmpDir();
  cleanup.push(() => fs.rmSync(root, { recursive: true, force: true }));
  const inbox: Inbox = createInbox(path.join(root, 'inbox'));
  let pairedId = opts.paired ?? null;
  const delivered: string[][] = [];
  const states: ExtensionState[] = [];
  const srv: SyncServer = createSyncServer({
    port: 0, // the OS picks a free port, so tests never clash with a running TypeLens
    appVersion: '9.9.9',
    inbox,
    pairing: { get: () => pairedId, set: (id) => void (pairedId = id) },
    onSessions: (ids) => void delivered.push(ids),
    onExtension: (s) => void states.push(s),
  });
  await srv.listen();
  cleanup.push(() => srv.close());
  const port = (srv.server.address() as AddressInfo).port;
  const base = `http://${DESKTOP_HOST}:${port}`;
  const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', origin: EXT, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  /** raw request, for headers fetch() will not let us set (Host) */
  const raw = (p: string, headers: Record<string, string>, body = '{}') =>
    new Promise<number>((resolve, reject) => {
      const req = http.request({ host: DESKTOP_HOST, port, path: p, method: 'POST', headers }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end(body);
    });
  return { srv, inbox, post, raw, base, port, delivered, states, paired: () => pairedId };
}

describe('sync server', () => {
  it('binds to 127.0.0.1 only', async () => {
    const { srv } = await boot();
    expect((srv.server.address() as AddressInfo).address).toBe(DESKTOP_HOST);
  });

  it('answers hello for an extension origin, records its state and pairs it on first contact', async () => {
    const { post, states, paired } = await boot();
    const res = await post(DESKTOP_HELLO_PATH, { extVersion: '0.2.0', recorderSeenAt: 123, health: { ok: false, missing: ['result'] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ app: 'typelens', api: DESKTOP_API, version: '9.9.9' });
    expect(paired()).toBe(EXT_ID);
    expect(states.at(-1)).toMatchObject({ version: '0.2.0', recorderSeenAt: 123, health: { ok: false, missing: ['result'] } });
  });

  it('keeps the Monkeytype theme from hello, and keeps the last one when a hello has none', async () => {
    const { post, states } = await boot();
    const theme = { name: 'serika_dark', bg: '#323437', main: '#e2b714', sub: '#646669', subAlt: '#2c2e31', text: '#d1d0c5', error: '#ca4754' };
    await post(DESKTOP_HELLO_PATH, { extVersion: '1.0.2', recorderSeenAt: null, health: null, theme });
    expect(states.at(-1)?.theme).toEqual(theme);
    await post(DESKTOP_HELLO_PATH, { extVersion: '1.0.2', recorderSeenAt: null, health: null });
    expect(states.at(-1)?.theme).toEqual(theme);
    await post(DESKTOP_HELLO_PATH, { extVersion: '1.0.2', recorderSeenAt: null, health: null, theme: { ...theme, bg: 'url(evil)' } });
    expect(states.at(-1)?.theme).toEqual(theme); // malformed colours are ignored
  });

  it('refuses requests without an extension Origin (web pages cannot call it)', async () => {
    const { post, inbox, base } = await boot();
    const none = await fetch(base + DESKTOP_HELLO_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(none.status).toBe(403);
    const web = await post(DESKTOP_SESSIONS_PATH, { sessions: [session('x')] }, { origin: 'https://evil.example' });
    expect(web.status).toBe(403);
    const localhostPage = await post(DESKTOP_SESSIONS_PATH, { sessions: [session('x')] }, { origin: 'http://localhost:5173' });
    expect(localhostPage.status).toBe(403);
    expect(await inbox.list()).toEqual([]);
  });

  it('refuses a wrong Host header (DNS rebinding)', async () => {
    const { raw, port } = await boot();
    const status = await raw(DESKTOP_HELLO_PATH, { host: `evil.example:${port}`, origin: EXT, 'content-type': 'application/json' });
    expect(status).toBe(421);
  });

  it('only accepts the paired extension once one has paired', async () => {
    const { post } = await boot({ paired: 'someoneelseidididididididididid' });
    const res = await post(DESKTOP_HELLO_PATH, { extVersion: '1' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/paired/);
  });

  it('rejects ids too long to be file names instead of failing the whole request', async () => {
    const { post, inbox } = await boot();
    const res = await post(DESKTOP_SESSIONS_PATH, { sessions: [session('x'.repeat(500)), session('ok')] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toEqual(['ok']);
    expect(body.rejected).toHaveLength(1);
    expect(await inbox.list()).toEqual(['ok']);
  });

  it('stores valid pushed sessions in the inbox before answering, and reports rejects', async () => {
    const { post, inbox, delivered } = await boot();
    const history = { ...session('hist'), source: 'monkeytype-history', history: { mtId: 'q' } };
    const res = await post(DESKTOP_SESSIONS_PATH, { sessions: [session('a'), session('b'), { id: 'broken' }, history] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toEqual(['a', 'b']);
    expect(body.rejected.map((r: { id: string | null }) => r.id)).toEqual(['broken', 'hist']);
    expect((await inbox.list()).sort()).toEqual(['a', 'b']);
    expect(delivered).toEqual([['a', 'b']]);
  });

  it('is idempotent: pushing the same session again leaves one copy', async () => {
    const { post, inbox } = await boot();
    await post(DESKTOP_SESSIONS_PATH, { sessions: [session('a')] });
    const again = await post(DESKTOP_SESSIONS_PATH, { sessions: [session('a')] });
    expect((await again.json()).accepted).toEqual(['a']);
    expect(await inbox.list()).toEqual(['a']);
  });

  it('rejects bad methods, paths, content types, JSON and shapes', async () => {
    const { post, base } = await boot();
    expect((await fetch(base + DESKTOP_HELLO_PATH, { method: 'GET', headers: { origin: EXT } })).status).toBe(405);
    expect((await post('/v1/nope', {})).status).toBe(404);
    expect((await post(DESKTOP_HELLO_PATH, '{}', { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await post(DESKTOP_HELLO_PATH, '{ nope')).status).toBe(400);
    expect((await post(DESKTOP_SESSIONS_PATH, { sessions: 'x' })).status).toBe(400);
    expect((await post(DESKTOP_SESSIONS_PATH, [])).status).toBe(400);
  });

  it('refuses a body over the size limit', async () => {
    const { raw } = await boot();
    const status = await raw(DESKTOP_SESSIONS_PATH, { origin: EXT, 'content-type': 'application/json', 'content-length': String(64 * 1024 * 1024) }, '{').catch(() => 413);
    expect(status).toBe(413);
  });

  it('never sends CORS headers', async () => {
    const { post } = await boot();
    const res = await post(DESKTOP_HELLO_PATH, { extVersion: '1' });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
