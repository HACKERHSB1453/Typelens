/**
 * Pushes recorded sessions to the TypeLens desktop app on 127.0.0.1. Runs in the service worker only.
 * A session is marked delivered only after the app has acknowledged it (the app writes to disk first),
 * so a crash mid-push just re-sends the same sessions next time.
 */
import {
  DESKTOP_HELLO_PATH,
  DESKTOP_ORIGIN,
  DESKTOP_PUSH_BATCH,
  DESKTOP_SESSIONS_PATH,
  type DesktopHello,
  type DesktopHelloReply,
  type DesktopPushReply,
} from '@typelens/core/desktop';
import type { Session } from '@typelens/core/schema';
import type { Db } from './db';
import { updateBadge, type HandlerDeps } from './handlers';

export interface DesktopState {
  connected: boolean;
  /** version reported by the desktop app */
  appVersion?: string;
  lastError?: string;
  /** the app refuses us because another extension is paired with it */
  pairedElsewhere?: boolean;
  lastTryAt?: number;
  lastOkAt?: number;
}

export interface DesktopDeps extends HandlerDeps {
  db: Db;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  now: () => number;
}

/** Hello must fail fast so an absent app does not hold up the service worker. */
const HELLO_TIMEOUT_MS = 4000;
/** A batch write on the app side can take a moment; generous but bounded. */
const PUSH_TIMEOUT_MS = 15000;
const NOT_RUNNING = 'TypeLens app not running';
const PAIRED_ELSEWHERE = 'paired with another extension — reset pairing in TypeLens';

class PushError extends Error {
  constructor(
    message: string,
    readonly pairedElsewhere = false,
  ) {
    super(message);
  }
}

let inflight: Promise<DesktopState> | null = null;
let again = false;

/**
 * Single-flight: concurrent callers (alarm, install, a new session) share one run. A call that arrives while a
 * run is already going (a test finished just after it looked for pending rows) makes it run once more, so that
 * test is not left waiting for the next alarm.
 */
export function pushToDesktop(deps: DesktopDeps): Promise<DesktopState> {
  if (inflight) {
    again = true;
    return inflight;
  }
  inflight = (async () => {
    try {
      let state: DesktopState;
      do {
        again = false;
        state = await run(deps);
        // only worth another round trip when something new is actually waiting
      } while (again && state.connected && (await deps.db.count()).pendingDesktop > 0);
      return state;
    } finally {
      inflight = null;
      again = false;
    }
  })();
  return inflight;
}

async function post(d: DesktopDeps, path: string, body: unknown, timeoutMs: number): Promise<Response> {
  return d.fetch(DESKTOP_ORIGIN + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function deliver(d: DesktopDeps): Promise<{ appVersion: string; delivered: number }> {
  const st = await d.storage.get(['recorderSeenAt', 'health']);
  const hello: DesktopHello = {
    extVersion: d.extVersion,
    recorderSeenAt: typeof st.recorderSeenAt === 'number' ? st.recorderSeenAt : null,
    health: (st.health as DesktopHello['health']) ?? null,
  };

  let r: Response;
  try {
    r = await post(d, DESKTOP_HELLO_PATH, hello, HELLO_TIMEOUT_MS);
  } catch {
    throw new PushError(NOT_RUNNING); // connection refused or timed out: the app is not running
  }
  if (r.status === 403) throw new PushError(PAIRED_ELSEWHERE, true);
  const info = (await r.json().catch(() => null)) as DesktopHelloReply | null;
  if (!r.ok || info?.app !== 'typelens') throw new PushError('something else answers on the TypeLens port');

  let warned = false;
  let delivered = 0;
  for (;;) {
    // rejected rows are stored as desktop:2, so they never come back here and cannot block newer rows
    const rows: Session[] = await d.db.pendingDesktop(DESKTOP_PUSH_BATCH);
    if (rows.length === 0) break;

    let res: Response;
    try {
      res = await post(d, DESKTOP_SESSIONS_PATH, { sessions: rows }, PUSH_TIMEOUT_MS);
    } catch {
      throw new PushError(NOT_RUNNING);
    }
    if (res.status === 403) throw new PushError(PAIRED_ELSEWHERE, true);
    if (!res.ok) throw new PushError(`the app answered HTTP ${res.status}`);

    const reply = (await res.json()) as DesktopPushReply;
    // Only trust ids that were in this batch. Rows in neither list stay pending.
    const sent = new Set(rows.map((r) => r.id));
    const accepted = (reply.accepted ?? []).filter((id) => sent.has(id));
    const rejected = (reply.rejected ?? []).filter((r): r is { id: string; error: string } => !!r.id && sent.has(r.id));
    if (rejected.length && !warned) console.warn('[typelens] desktop app rejected sessions:', rejected);
    if (rejected.length) warned = true;
    if (accepted.length) await d.db.markDesktop(accepted);
    if (rejected.length) await d.db.markRejected(rejected);
    delivered += accepted.length;
    // The app decided nothing about this batch: stop rather than re-send the same rows forever.
    if (accepted.length + rejected.length === 0) break;
  }
  return { appVersion: info.version, delivered };
}

async function run(d: DesktopDeps): Promise<DesktopState> {
  const now = d.now();
  const prev = ((await d.storage.get(['desktop'])).desktop as DesktopState | undefined) ?? undefined;
  let state: DesktopState;
  try {
    const { appVersion } = await deliver(d);
    state = { connected: true, appVersion, lastTryAt: now, lastOkAt: now };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // one debug line per attempt at most; the app being closed is normal
    console.debug('[typelens] desktop push skipped:', msg);
    state = {
      connected: false,
      lastTryAt: now,
      ...(prev?.lastOkAt !== undefined ? { lastOkAt: prev.lastOkAt } : {}),
      lastError: msg,
      ...(err instanceof PushError && err.pairedElsewhere ? { pairedElsewhere: true } : {}),
    };
  }
  await d.storage.set({ desktop: state });
  await updateBadge(d);
  return state;
}
