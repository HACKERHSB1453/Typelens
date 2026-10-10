import 'fake-indexeddb/auto';
import { sanitizeMonkeytypeTheme } from '@typelens/core/desktop';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { makeSession, repeatWords, type Session } from '@typelens/core';
import { createDb, type Db } from '../../extension/src/db';
import { handleMessage, type HandlerDeps } from '../../extension/src/handlers';
import type { Msg } from '../../extension/src/protocol';
import { LocalDataSource, looksUnreliable, repairResult } from '../src/data/LocalDataSource';
import { createStore } from '../src/data/store';
import { createWebHost } from '../src/host/webHost';
import type { Bridge, BridgeAction } from '../src/data/bridge';

const APP = 'http://localhost:5173/';
const MT = 'https://monkeytype.com/';

/** A bridge that talks straight to the REAL extension handlers (the same mapping bridge.ts performs). */
function fakeBridge(deps: HandlerDeps, origin = APP): Bridge {
  const toMsg = (action: BridgeAction, p?: { after?: number; ids?: string[] }): Msg =>
    action === 'ping' ? { type: 'sync:ping' } : action === 'list' ? { type: 'sync:list', after: p?.after } : action === 'get' ? { type: 'sync:get', ids: p?.ids ?? [] } : { type: 'sync:ack', ids: p?.ids ?? [] };
  const request = async <T,>(action: BridgeAction, payload?: { after?: number; ids?: string[] }): Promise<T> => (await handleMessage(toMsg(action, payload), origin, deps)) as T;
  return {
    request,
    ping: async () => {
      try {
        return ((await request<{ ok?: boolean }>('ping')) ?? {}).ok === true;
      } catch {
        return false;
      }
    },
    monkeytypeTheme: async () => {
      try {
        return sanitizeMonkeytypeTheme((await request<{ theme?: unknown }>('ping'))?.theme);
      } catch {
        return null;
      }
    },
  };
}

function kv() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

/** a data source over the web host, exactly as the browser app wires it */
function localDs(dbName: string, bridge: Bridge, storage: ReturnType<typeof kv>): LocalDataSource {
  return new LocalDataSource(createWebHost({ store: createStore(new IDBFactory(), dbName), bridge, storage }));
}

const long = (id: string, startedAt: number, extra: Partial<Parameters<typeof makeSession>[0]> = {}) =>
  makeSession({ id, startedAt, text: repeatWords('the ah cat dog', 24), ...extra });

let extDb: Db;
let deps: HandlerDeps;
let ds: LocalDataSource;
let storage: ReturnType<typeof kv>;

beforeEach(() => {
  extDb = createDb(new IDBFactory(), `ext-${Math.random()}`);
  deps = { db: extDb, extVersion: '0.1.0', setBadge: () => undefined, storage: { get: async () => ({}), set: async () => undefined } };
  storage = kv();
  ds = localDs(`web-${Math.random()}`, fakeBridge(deps), storage);
});

async function record(s: Session): Promise<void> {
  await handleMessage({ type: 'session', session: s }, MT, deps); // exactly what capture.ts sends
}

describe('sync: extension -> web app', () => {
  it('pulls every session, acks them, and is idempotent', async () => {
    for (let i = 0; i < 25; i++) await record(long(`s${String(i).padStart(2, '0')}`, 1_700_000_000_000 + i * 60_000));
    expect((await extDb.count()).unsynced).toBe(25);

    const first = await ds.syncFromExtension();
    expect(first).toEqual({ imported: 25, skipped: 0, errors: [] }); // 25 > the 20-per-request batch: two batches
    expect(await ds.count()).toBe(25);
    expect((await extDb.count())).toMatchObject({ total: 25, unsynced: 0 }); // acked, but the extension KEEPS its copy

    const again = await ds.syncFromExtension();
    expect(again).toEqual({ imported: 0, skipped: 25, errors: [] });
    expect(await ds.count()).toBe(25);

    // a new test arrives later: only that one is imported
    await record(long('new', 1_700_100_000_000));
    expect(await ds.syncFromExtension()).toEqual({ imported: 1, skipped: 25, errors: [] });
  });

  it('serves analysis, summaries, progress and replay from the synced data', async () => {
    for (let i = 0; i < 6; i++) await record(long(`a${i}`, 1_700_000_000_000 + i * 86_400_000));
    await ds.syncFromExtension();

    const list = await ds.listSessions();
    expect(list).toHaveLength(6);
    expect(list[0]!.startedAt).toBeGreaterThan(list[5]!.startedAt); // newest first
    // 24 words cycling "the ah cat dog": 6 x (3+2+3+3 = 11 letters) = 66, plus 24 committing spaces = 90 keystrokes
    expect(list[0]).toMatchObject({ completed: true, flags: [], keystrokes: 90 });

    const a = await ds.getAnalysis();
    expect(a.sessions).toBe(6);
    expect(a.keystrokes).toBe(list.reduce((n, s) => n + s.keystrokes, 0));
    expect(a.bigrams.length).toBeGreaterThan(0);
    expect(await ds.getAnalysis()).toBe(a); // cached until the data changes

    const p = await ds.getProgress();
    expect(p.points.length).toBeGreaterThanOrEqual(6);

    const r = await ds.getReplay('a3');
    expect(r.sessionId).toBe('a3');
    expect(r.keyEvents.length).toBeGreaterThan(0);
    await expect(ds.getReplay('missing')).rejects.toThrow('No session');
  });

  it('reports invalid sessions instead of storing them, and only acks what it stored', async () => {
    await record(long('ok', 1_700_000_000_000));
    // corrupt one directly in the extension DB (what a buggy older capture might have left behind)
    await extDb.put({ ...long('bad', 1_700_000_001_000), inputEvents: [{ t: 1, op: 'bogus', wi: 0, ci: 0 }] } as unknown as Session);
    const r = await ds.syncFromExtension();
    expect(r.imported).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('invalid input event');
    expect(await ds.count()).toBe(1);
    expect((await extDb.count()).unsynced).toBe(1); // 'bad' stays un-acked so it is not silently lost
  });

  it('flags a capture whose numbers disagree wildly with Monkeytype\'s own result screen', async () => {
    const good = long('good', 1_700_000_000_000, { result: undefined });
    const claimed = { wpm: 999, rawWpm: 999, acc: 100, consistency: 90, testDurationSec: 30 };
    const bad = long('bad', 1_700_000_100_000, { result: claimed });
    expect(looksUnreliable(good)).toBe(false);
    expect(looksUnreliable(bad)).toBe(true);
    await record(bad);
    await ds.syncFromExtension();
    const s = (await ds.listSessions())[0]!;
    expect(s.flags).toContain('captureUnreliable');
    expect((await ds.getAnalysis()).sessions).toBe(0); // flagged sessions are excluded from analysis by default
    expect((await ds.getAnalysis({ excludeFlagged: false })).sessions).toBe(1);
  });
});

describe('large imports and concurrent loads', () => {
  it('hands the host sessions in bounded chunks', async () => {
    const calls: number[] = [];
    const host = createWebHost({ store: createStore(new IDBFactory(), `chunk-${Math.random()}`), bridge: fakeBridge(deps), storage: kv() });
    const orig = host.sessions.putMany.bind(host.sessions);
    host.sessions.putMany = (s) => (calls.push(s.length), orig(s));
    const d = new LocalDataSource(host);
    const rows = Array.from({ length: 1200 }, (_, i) => long(`bulk${i}`, 1_700_000_000_000 + i * 60_000));
    const file = new File([JSON.stringify({ v: 1, sessions: rows })], 'x.json');
    const r = await d.importJson(file);
    expect(r.imported).toBe(1200);
    expect(Math.max(...calls)).toBeLessThanOrEqual(500);
  });

  it('does not keep rows from a load that was overtaken by a change', async () => {
    const store = createStore(new IDBFactory(), `race-${Math.random()}`);
    const host = createWebHost({ store, bridge: fakeBridge(deps), storage: kv() });
    const d = new LocalDataSource(host);
    await host.sessions.putMany([long('one', 1_700_000_000_000)]);
    const slow = d.listSessions({});
    await host.sessions.putMany([long('two', 1_700_000_100_000)]);
    d.reload(); // the host says it changed while the first load was in flight
    await slow;
    expect((await d.listSessions({})).map((s) => s.id).sort()).toEqual(['one', 'two']);
  });
});

describe('practice linking', () => {
  it('links a later custom-text session to the text that was generated', async () => {
    for (let i = 0; i < 5; i++) await record(long(`h${i}`, 1_700_000_000_000 + i * 60_000));
    await ds.syncFromExtension();
    const generated = await ds.generatePractice({ focus: { kind: 'grams', grams: ['th'] }, length: 30, emphasis: 'balanced', hand: 'both' });

    const practiceRun = makeSession({ id: 'p1', startedAt: Date.now() + 5_000, text: generated.text, config: { mode: 'custom', mode2: 'custom' } });
    await record(practiceRun);
    await ds.syncFromExtension();
    const linked = (await ds.listSessions()).find((s) => s.id === 'p1')!;
    expect(linked.practice).toMatchObject({ focus: generated.focus });
    expect((await ds.getAnalysis({ practiceOnly: true })).sessions).toBe(1);

    // a custom session with unrelated words is NOT linked
    await record(makeSession({ id: 'p2', startedAt: Date.now() + 9_000, text: repeatWords('zebra yak quartz', 12), config: { mode: 'custom', mode2: 'custom' } }));
    await ds.syncFromExtension();
    expect((await ds.listSessions()).find((s) => s.id === 'p2')!.practice).toBeUndefined();
  });
});

describe('import, export and delete', () => {
  it('round-trips through JSON export/import and CSV export', async () => {
    for (let i = 0; i < 3; i++) await record(long(`e${i}`, 1_700_000_000_000 + i * 60_000));
    await ds.syncFromExtension();
    const json = await (await ds.exportJson()).text();
    expect(JSON.parse(json)).toMatchObject({ v: 1 });

    const other = localDs(`web2-${Math.random()}`, fakeBridge(deps), kv());
    const file = new File([json], 'export.json', { type: 'application/json' });
    expect(await other.importJson(file)).toEqual({ imported: 3, skipped: 0, errors: [] });
    expect(await other.importJson(file)).toEqual({ imported: 0, skipped: 3, errors: [] }); // importing twice adds nothing
    expect((await other.getAnalysis()).keystrokes).toBe((await ds.getAnalysis()).keystrokes);

    const sessionsCsv = await (await ds.exportCsv('sessions')).text();
    expect(sessionsCsv.trim().split('\r\n')).toHaveLength(1 + 3);
    const keystrokesCsv = await (await ds.exportCsv('keystrokes')).text();
    expect(keystrokesCsv.split('\r\n')[0]).toContain('sessionId,idx,t,code');

    expect((await other.importJson(new File(['not json'], 'x.json'))).errors).toEqual(['That file is neither a TypeLens JSON export nor a Monkeytype results CSV.']);
  });

  it('deletes one session or everything, and notifies subscribers', async () => {
    for (let i = 0; i < 3; i++) await record(long(`d${i}`, 1_700_000_000_000 + i * 60_000));
    await ds.syncFromExtension();
    let changes = 0;
    const unsub = ds.subscribe(() => void changes++);
    await ds.deleteSession('d1');
    expect(await ds.count()).toBe(2);
    expect(changes).toBe(1);
    await ds.deleteAll();
    expect(await ds.count()).toBe(0);
    expect((await ds.getAnalysis()).sessions).toBe(0);
    unsub();
  });

  it('reports extension connectivity through the bridge', async () => {
    expect(await ds.isExtensionConnected()).toBe(true);
    const wrongOrigin = localDs(`web3-${Math.random()}`, fakeBridge(deps, 'https://evil.example/'), kv());
    expect(await wrongOrigin.isExtensionConnected()).toBe(false); // the extension refuses unknown origins
    await expect(wrongOrigin.syncFromExtension()).rejects.toThrow('forbidden');
  });
});

describe('real-world data from the first live test (2026-09-24)', () => {
  it('repairs a result mis-read by extension 0.1.0 (acc = correct-char count, duration 0) and keeps the test', async () => {
    // "can be no or have few come those this general", 100% accurate at ~134 wpm, but read as 45% / 0 s
    const real = makeSession({ id: 'live', startedAt: 1_700_000_000_000, text: 'can be no or have few come those this general', msPerKey: 90 });
    const misread = { ...real, result: { wpm: 134.33, rawWpm: 134.33, acc: 45, consistency: 18.03, testDurationSec: 0, charStats: [45, 0, 0, 0] as [number, number, number, number] } };
    const fixed = repairResult(misread);
    expect(fixed.result!.wpm).toBe(134.33); // Monkeytype's WPM is kept
    expect(fixed.result!.acc).toBe(100); // rebuilt from the keystrokes
    expect(fixed.result!.testDurationSec).toBeGreaterThan(3);
    expect(looksUnreliable(misread)).toBe(false); // the keystrokes are fine: do not throw the test out
    await record(misread);
    await ds.syncFromExtension();
    expect((await ds.getAnalysis()).sessions).toBe(1);
    expect((await ds.listSessions())[0]).toMatchObject({ acc: 100, wpm: 134.3 });
  });

  it('restart fragments do not drag the speed average down but still feed key statistics', async () => {
    const done = makeSession({ id: 'done', startedAt: 1_700_000_000_000, text: repeatWords('the ah cat dog', 12) });
    await record(done);
    for (let i = 0; i < 5; i++) {
      await record(makeSession({ id: `r${i}`, startedAt: 1_700_000_100_000 + i * 1000, text: 'the ah', completed: false, flags: ['restart'] }));
    }
    await ds.syncFromExtension();
    const withRestarts = await ds.getAnalysis();
    const alone = localDs(`solo-${Math.random()}`, fakeBridge(deps), kv());
    await alone.importJson(new File([JSON.stringify([done])], 'x.json'));
    expect(withRestarts.overall.wpm).toBe((await alone.getAnalysis()).overall.wpm);
    expect(withRestarts.keystrokes).toBeGreaterThan((await alone.getAnalysis()).keystrokes);
  });
});
describe('Monkeytype results CSV import', () => {
  const HEADER = '_id,isPb,wpm,acc,rawWpm,consistency,charStats,mode,mode2,quoteLength,restartCount,testDuration,afkDuration,incompleteTestSeconds,punctuation,numbers,language,funbox,difficulty,lazyMode,blindMode,bailedOut,tags,timestamp';

  it('imports history, skips rows the extension already recorded (either order), and is idempotent', async () => {
    const recorded = makeSession({ id: 'rec', startedAt: 1_790_269_336_000 - 5_380, text: repeatWords('the ah cat dog', 24), config: { mode: 'words', mode2: '10' }, result: { wpm: 111.52, rawWpm: 111.52, acc: 94.34, consistency: 69.67, testDurationSec: 5.38 } });
    await record(recorded);
    await ds.syncFromExtension();
    const csv = [
      HEADER,
      '6ab561d69503ffe34a04d147,false,99,96.02,102.2,66.95,495;7;2;2,time,60,-1,5,60,1,28.13,false,false,english,,normal,false,false,false,,1790271958000',
      '6ab5579a9503ffe34a043619,false,111.52,94.34,111.52,69.67,50;0;0;0,words,10,-1,1,5.38,0,2.25,false,false,english,,normal,false,false,false,,1790269338000',
    ].join('\n');
    const file = new File([csv], 'results.csv', { type: 'text/csv' });
    expect(await ds.importJson(file)).toEqual({ imported: 1, skipped: 1, errors: [] }); // the words-10 row is the recorded test
    expect(await ds.importJson(file)).toEqual({ imported: 0, skipped: 2, errors: [] });
    const list = await ds.listSessions();
    expect(list.map((s) => s.id).sort()).toEqual(['mt-6ab561d69503ffe34a04d147', 'rec']);
    expect((await ds.getReplay('mt-6ab561d69503ffe34a04d147')).keyEvents).toEqual([]);

    // other order: history first, then the recording arrives — still shown once
    const other = localDs(`order-${Math.random()}`, fakeBridge(deps), kv());
    await other.importJson(file); // imports both rows (nothing recorded yet)
    await other.syncFromExtension(); // now the recording arrives
    expect((await other.listSessions()).map((s) => s.id).sort()).toEqual(['mt-6ab561d69503ffe34a04d147', 'rec']);
  });
});