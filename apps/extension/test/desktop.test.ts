import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Session } from '@typelens/core/schema';
import { DESKTOP_ORIGIN, DESKTOP_HELLO_PATH, DESKTOP_SESSIONS_PATH } from '@typelens/core/desktop';
import { createDb, type Db } from '../src/db';
import { pushToDesktop, type DesktopDeps, type DesktopState } from '../src/desktop';

function session(i: number): Session {
  return {
    v: 1,
    id: `s${String(i).padStart(3, '0')}`,
    startedAt: i * 1000,
    source: 'monkeytype',
    config: { mode: 'time', mode2: '30', language: 'english', punctuation: false, numbers: false, funbox: [] },
    words: ['a'],
    keyEvents: [],
    inputEvents: [],
    completed: true,
    flags: [],
    result: { wpm: 70, rawWpm: 72, acc: 96, consistency: 80, testDurationSec: 30 },
    client: { extVersion: '1.0.0' },
  };
}

type Body = { sessions?: Session[] };
type Handler = (path: string, body: Body) => Response | Promise<Response>;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const HELLO_OK = () => json({ app: 'typelens', api: 1, version: '1.0.0' });

let db: Db;
let store: Record<string, unknown>;
let badge: string;
let calls: Array<{ path: string; body: Body }>;

/** Deps whose fetch is routed by path; `route` produces each reply. */
function makeDeps(route: Handler): DesktopDeps {
  return {
    db,
    extVersion: '1.0.0',
    storage: {
      get: async (keys) => Object.fromEntries(keys.map((k) => [k, store[k]])),
      set: async (items) => void Object.assign(store, items),
    },
    setBadge: (t) => (badge = t),
    now: () => 5_000,
    fetch: async (url, init) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Body) : {};
      const path = url.slice(DESKTOP_ORIGIN.length);
      calls.push({ path, body });
      return route(path, body);
    },
  };
}

/** A fake app that accepts every session it is sent. */
const happyApp: Handler = (path, body) => {
  if (path === DESKTOP_HELLO_PATH) return HELLO_OK();
  if (path === DESKTOP_SESSIONS_PATH) return json({ accepted: (body.sessions ?? []).map((s) => s.id), rejected: [] });
  return json({}, 404);
};

const pushes = () => calls.filter((c) => c.path === DESKTOP_SESSIONS_PATH);

beforeEach(async () => {
  db = createDb(new IDBFactory(), `t-${Math.random()}`);
  store = {};
  badge = 'unset';
  calls = [];
  for (let i = 1; i <= 45; i++) await db.put(session(i));
});

describe('pushToDesktop', () => {
  it('app not running: records a quiet failure and leaves the sessions pending', async () => {
    const st = await pushToDesktop(
      makeDeps(() => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(st.connected).toBe(false);
    expect(st.lastError).toBe('TypeLens app not running');
    expect(store.desktop).toEqual(st);
    expect((await db.count()).pendingDesktop).toBe(45);
    expect(badge).toBe('45');
    expect(calls).toHaveLength(1); // only the hello, no pushes
  });

  it('success: pushes in batches of 20, marks everything delivered, clears the badge', async () => {
    const st = await pushToDesktop(makeDeps(happyApp));
    expect(st).toEqual({ connected: true, appVersion: '1.0.0', lastTryAt: 5000, lastOkAt: 5000 } satisfies DesktopState);
    expect(pushes().map((c) => c.body.sessions?.length)).toEqual([20, 20, 5]);
    expect((await db.count()).pendingDesktop).toBe(0);
    expect(badge).toBe('');
  });

  it('a push requested while one is running runs once more, so a test recorded meanwhile is not left for the next alarm', async () => {
    const base = makeDeps(happyApp);
    let injected = false;
    const deps: DesktopDeps = {
      ...base,
      db: {
        ...db,
        // a test finishes right after the run looked for pending rows and found none
        pendingDesktop: async (n) => {
          const rows = await db.pendingDesktop(n);
          if (rows.length === 0 && !injected) {
            injected = true;
            await db.put(session(100));
            void pushToDesktop(deps);
          }
          return rows;
        },
      },
    };
    await pushToDesktop(deps);
    expect(calls.filter((c) => c.path === DESKTOP_HELLO_PATH)).toHaveLength(2);
    expect((await db.count()).pendingDesktop).toBe(0);
  });

  it('a hello answered by something other than TypeLens counts as not connected', async () => {
    const st = await pushToDesktop(makeDeps(() => json({ app: 'other' })));
    expect(st.connected).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('HTTP 403 on hello means another extension is paired: reported, no retry loop', async () => {
    const st = await pushToDesktop(makeDeps(() => json({ error: 'paired' }, 403)));
    expect(st).toMatchObject({ connected: false, pairedElsewhere: true, lastError: expect.stringContaining('another extension') });
    expect(calls).toHaveLength(1);
  });

  it('403 while pushing stops the run and keeps the sessions pending', async () => {
    const st = await pushToDesktop(makeDeps((path) => (path === DESKTOP_HELLO_PATH ? HELLO_OK() : json({}, 403))));
    expect(st.pairedElsewhere).toBe(true);
    expect((await db.count()).pendingDesktop).toBe(45);
  });

  it('rejected rows are stored as rejected: the run moves on and they are never pending again', async () => {
    const st = await pushToDesktop(
      makeDeps((path, body) =>
        path === DESKTOP_HELLO_PATH
          ? HELLO_OK()
          : json({ accepted: [], rejected: (body.sessions ?? []).map((s) => ({ id: s.id, error: 'bad' })) }),
      ),
    );
    expect(st.connected).toBe(true);
    expect(pushes()).toHaveLength(3); // 20 + 20 + 5, all rejected, run continues
    expect(await db.count()).toEqual({ total: 45, unsynced: 45, pendingDesktop: 0 });
    expect(await db.pendingDesktop(10)).toEqual([]);
  });

  it('rejected rows do not come back on later runs, so newer rows are not blocked', async () => {
    const bad = new Set(['s001', 's002']);
    await pushToDesktop(
      makeDeps((path, body) => {
        if (path !== DESKTOP_SESSIONS_PATH) return happyApp(path, body);
        const sessions = body.sessions ?? [];
        return json({
          accepted: sessions.filter((s) => !bad.has(s.id)).map((s) => s.id),
          rejected: sessions.filter((s) => bad.has(s.id)).map((s) => ({ id: s.id, error: 'bad' })),
        });
      }),
    );
    expect(await db.count()).toEqual({ total: 45, unsynced: 2, pendingDesktop: 0 });
    // a later session, recorded after the rejected ones, must still go out
    await db.put(session(46));
    calls = [];
    await pushToDesktop(makeDeps(happyApp));
    const sent = pushes().flatMap((c) => (c.body.sessions ?? []).map((s) => s.id));
    expect(sent).toEqual(['s046']);
    expect((await db.count()).pendingDesktop).toBe(0);
  });

  it('a row the app does not mention stays pending, and the run still ends', async () => {
    const st = await pushToDesktop(makeDeps((path) => (path === DESKTOP_HELLO_PATH ? HELLO_OK() : json({ accepted: [], rejected: [] }))));
    expect(st.connected).toBe(true);
    expect(pushes()).toHaveLength(1); // no progress in the batch, so no re-send loop
    expect((await db.count()).pendingDesktop).toBe(45);
  });

  it('single-flight: concurrent calls share one run', async () => {
    const deps = makeDeps(happyApp);
    const [a, b] = await Promise.all([pushToDesktop(deps), pushToDesktop(deps)]);
    expect(a).toBe(b);
    expect(calls.filter((c) => c.path === DESKTOP_HELLO_PATH)).toHaveLength(1);
  });

  it('after a failed run, lastOkAt from an earlier success is kept', async () => {
    await pushToDesktop(makeDeps(happyApp));
    const st = await pushToDesktop(
      makeDeps(() => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(st.lastOkAt).toBe(5000);
    expect(st.connected).toBe(false);
  });
});
