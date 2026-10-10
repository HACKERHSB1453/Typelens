/**
 * The local endpoint the browser extension pushes recorded sessions to. Security model:
 *  - bound to 127.0.0.1 only, so nothing on the network can reach it;
 *  - the Host header must be our own address (blocks DNS-rebinding attacks from web pages);
 *  - the Origin header must be a browser extension (web pages cannot forge it), and after the first
 *    successful contact only that one extension id is accepted ("pairing"; the user can reset it);
 *  - no CORS headers are ever sent, so web pages cannot read a response either;
 *  - every session is validated with the same rules as a file import before it is stored.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  DESKTOP_API,
  DESKTOP_HELLO_PATH,
  DESKTOP_HOST,
  DESKTOP_MAX_BODY,
  DESKTOP_SESSIONS_PATH,
  sanitizeMonkeytypeTheme,
  type DesktopHello,
  type DesktopHelloReply,
  type DesktopPushReply,
  type MonkeytypeTheme,
} from '@typelens/core/desktop';
import { validateSession } from '@typelens/core/export';
import type { Inbox } from './inbox';

export interface ExtensionState {
  id: string | null;
  version: string | null;
  lastSeenAt: number | null;
  recorderSeenAt: number | null;
  health: { ok: boolean; missing: string[] } | null;
  theme: MonkeytypeTheme | null;
}

export interface Pairing {
  get(): string | null;
  set(id: string | null): void;
}

export interface SyncServerOptions {
  port: number;
  appVersion: string;
  inbox: Inbox;
  pairing: Pairing;
  /** called after sessions were stored in the inbox */
  onSessions(ids: string[]): void;
  /** called whenever what the extension reported changed */
  onExtension(state: ExtensionState): void;
  now?: () => number;
}

export interface SyncServer {
  listen(): Promise<void>;
  close(): Promise<void>;
  extension(): ExtensionState;
  readonly server: http.Server;
}

const MAX_ID_LENGTH = 100;
const EXT_ORIGIN = /^(chrome|moz)-extension:\/\/([a-z0-9-]{1,64})$/i;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function readBody(req: http.IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      reject(new HttpError(413, 'request too large'));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'request too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isHealth(x: unknown): x is ExtensionState['health'] {
  if (x === null) return true;
  if (!x || typeof x !== 'object') return false;
  const h = x as Record<string, unknown>;
  return typeof h.ok === 'boolean' && Array.isArray(h.missing) && h.missing.every((m) => typeof m === 'string');
}

export function createSyncServer(opts: SyncServerOptions): SyncServer {
  const now = opts.now ?? Date.now;
  /** the real port: differs from opts.port only when 0 (tests let the OS pick one) */
  let boundPort = opts.port;
  const hostAllowed = (h: string): boolean => h === `${DESKTOP_HOST}:${boundPort}` || h === `localhost:${boundPort}`;
  let ext: ExtensionState = { id: opts.pairing.get(), version: null, lastSeenAt: null, recorderSeenAt: null, health: null, theme: null };

  /** returns the calling extension's id, or throws */
  function authorise(req: http.IncomingMessage): string {
    if (!hostAllowed(String(req.headers.host ?? '').toLowerCase())) throw new HttpError(421, 'wrong host');
    const m = EXT_ORIGIN.exec(String(req.headers.origin ?? ''));
    if (!m) throw new HttpError(403, 'only the TypeLens browser extension may call this');
    const id = m[2]!.toLowerCase();
    const paired = opts.pairing.get();
    if (paired && paired !== id) throw new HttpError(403, 'this app is paired with a different extension; reset pairing in TypeLens > Data');
    return id;
  }

  function seen(id: string, patch: Partial<ExtensionState> = {}): void {
    if (!opts.pairing.get()) opts.pairing.set(id); // first contact pairs
    ext = { ...ext, ...patch, id, lastSeenAt: now() };
    opts.onExtension(ext);
  }

  async function handle(req: http.IncomingMessage): Promise<{ status: number; body: unknown }> {
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method !== 'POST') throw new HttpError(405, 'POST only');
    if (url.pathname !== DESKTOP_HELLO_PATH && url.pathname !== DESKTOP_SESSIONS_PATH) throw new HttpError(404, 'not found');
    const id = authorise(req);
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'JSON only');
    let json: unknown;
    try {
      json = JSON.parse(await readBody(req, DESKTOP_MAX_BODY));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, 'invalid JSON');
    }
    if (!json || typeof json !== 'object') throw new HttpError(400, 'expected an object');
    const body = json as Record<string, unknown>;

    if (url.pathname === DESKTOP_HELLO_PATH) {
      const h = body as Partial<DesktopHello>;
      seen(id, {
        version: typeof h.extVersion === 'string' ? h.extVersion.slice(0, 32) : null,
        recorderSeenAt: typeof h.recorderSeenAt === 'number' ? h.recorderSeenAt : null,
        health: isHealth(h.health) ? h.health : null,
        // keep the last known theme when an older extension (or one that has not seen Monkeytype yet) sends none
        theme: sanitizeMonkeytypeTheme(h.theme) ?? ext.theme,
      });
      const reply: DesktopHelloReply = { app: 'typelens', api: DESKTOP_API, version: opts.appVersion };
      return { status: 200, body: reply };
    }

    if (!Array.isArray(body.sessions)) throw new HttpError(400, 'expected {"sessions":[...]}');
    const reply: DesktopPushReply = { accepted: [], rejected: [] };
    const valid: { id: string }[] = [];
    for (const s of body.sessions) {
      const problem = validateSession(s);
      const sid = s && typeof s === 'object' && typeof (s as { id?: unknown }).id === 'string' ? (s as { id: string }).id : null;
      if (problem || sid === null) reply.rejected.push({ id: sid, error: problem ?? 'missing id' });
      // ids become file names (hex-encoded, so twice as long); one that cannot be a file name would fail the whole request forever
      else if (sid.length > MAX_ID_LENGTH) reply.rejected.push({ id: sid, error: 'id too long' });
      else if ((s as { source?: unknown }).source !== 'monkeytype') reply.rejected.push({ id: sid, error: 'only recorded sessions can be pushed' });
      else valid.push(s as { id: string });
    }
    reply.accepted = await opts.inbox.put(valid);
    seen(id);
    if (reply.accepted.length) opts.onSessions(reply.accepted);
    return { status: 200, body: reply };
  }

  const server = http.createServer((req, res) => {
    handle(req).then(
      ({ status, body }) => send(res, status, body),
      (err: unknown) => {
        const status = err instanceof HttpError ? err.status : 500;
        send(res, status, { error: err instanceof Error ? err.message : 'error' });
      },
    );
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;

  function send(res: http.ServerResponse, status: number, body: unknown): void {
    if (res.headersSent || res.destroyed) return;
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(body));
  }

  return {
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        const onError = (err: Error): void => reject(err);
        server.once('error', onError);
        server.listen(opts.port, DESKTOP_HOST, () => {
          server.off('error', onError);
          boundPort = (server.address() as AddressInfo).port;
          resolve();
        });
      }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
    extension: () => ext,
  };
}
