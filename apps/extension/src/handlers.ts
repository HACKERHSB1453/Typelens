/**
 * Background message handling, written as a pure function over injected dependencies so it can be
 * unit-tested without chrome.*. Every message type is authorised by WHO sent it:
 *   session       <- monkeytype.com tabs only
 *   sync:*        <- the web-app origins only (via the bridge content script)
 *   popup/export/clear/popup:sync/dash:changed <- extension pages only
 */
import { sanitizeMonkeytypeTheme } from '@typelens/core/desktop';
import type { Session } from '@typelens/core/schema';
import type { Db } from './db';
import { isBridgeOrigin, isMonkeytypeUrl } from './bridge-origins';
import { SYNC_BATCH, type Msg } from './protocol';

export interface Storage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
export interface HandlerDeps {
  db: Db;
  storage: Storage;
  extVersion: string;
  setBadge(text: string): void;
  /** runs a desktop push now (popup "Sync now"); wired in background.ts */
  syncDesktop?: () => Promise<unknown>;
  /**
   * This extension's own origin (chrome-extension://<id> or moz-extension://<uuid>). When it is not given, any
   * extension page counts; runtime messages only ever come from this extension, so that is still safe.
   */
  extensionOrigin?: string;
}

/** Chromium uses chrome-extension://, Firefox moz-extension:// */
const EXTENSION_SCHEMES = ['chrome-extension:', 'moz-extension:'];

export function isExtensionPage(url: string | undefined, origin?: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (!EXTENSION_SCHEMES.includes(u.protocol)) return false;
    // URL.origin is "null" for non-web schemes in some engines, so compare scheme and host instead
    return origin === undefined || `${u.protocol}//${u.host}` === origin.replace(/\/+$/, '');
  } catch {
    return false;
  }
}

/** Structural check — what comes over a message channel is untrusted. */
export function isSession(x: unknown): x is Session {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  const cfg = s.config as Record<string, unknown> | undefined;
  return (
    s.v === 1 &&
    typeof s.id === 'string' &&
    s.id.length > 0 &&
    typeof s.startedAt === 'number' &&
    s.source === 'monkeytype' &&
    typeof cfg === 'object' &&
    cfg !== null &&
    typeof cfg.mode === 'string' &&
    Array.isArray(s.words) &&
    Array.isArray(s.keyEvents) &&
    Array.isArray(s.inputEvents) &&
    typeof s.completed === 'boolean' &&
    Array.isArray(s.flags)
  );
}

export async function updateBadge(deps: HandlerDeps): Promise<void> {
  const { unsynced } = await deps.db.count();
  deps.setBadge(unsynced > 0 ? String(unsynced) : '');
}

export async function handleMessage(msg: Msg, senderUrl: string | undefined, deps: HandlerDeps): Promise<unknown> {
  const { db } = deps;
  switch (msg.type) {
    case 'session': {
      if (!isMonkeytypeUrl(senderUrl)) throw new Error('forbidden');
      if (!isSession(msg.session)) throw new Error('invalid session');
      await db.put(msg.session);
      await updateBadge(deps);
      return { ok: true };
    }
    case 'sync:ping':
      if (!isBridgeOrigin(senderUrl)) throw new Error('forbidden');
      {
        const st = await deps.storage.get(['recorderSeenAt', 'health', 'mtTheme']);
        return {
          ok: true,
          version: deps.extVersion,
          recorderSeenAt: typeof st.recorderSeenAt === 'number' ? st.recorderSeenAt : null,
          health: st.health ?? null,
          theme: sanitizeMonkeytypeTheme(st.mtTheme),
        };
      }
    case 'sync:list': {
      if (!isBridgeOrigin(senderUrl)) throw new Error('forbidden');
      return { ids: await db.listIds(typeof msg.after === 'number' ? msg.after : undefined) };
    }
    case 'sync:get': {
      if (!isBridgeOrigin(senderUrl)) throw new Error('forbidden');
      const ids = (Array.isArray(msg.ids) ? msg.ids : []).filter((i) => typeof i === 'string').slice(0, SYNC_BATCH);
      return { sessions: await db.get(ids) };
    }
    case 'sync:ack': {
      if (!isBridgeOrigin(senderUrl)) throw new Error('forbidden');
      await db.ack((Array.isArray(msg.ids) ? msg.ids : []).filter((i) => typeof i === 'string'));
      await updateBadge(deps);
      return { ok: true };
    }
    case 'popup:state': {
      if (!isExtensionPage(senderUrl, deps.extensionOrigin)) throw new Error('forbidden');
      const [{ total, unsynced, pendingDesktop }, last, st] = await Promise.all([
        db.count(),
        db.last(),
        deps.storage.get(['paused', 'health', 'desktop']),
      ]);
      return {
        paused: st.paused === true,
        health: st.health ?? null,
        total,
        unsynced,
        pendingDesktop,
        desktop: st.desktop ?? null,
        last: last
          ? { wpm: last.result?.wpm ?? null, acc: last.result?.acc ?? null, at: last.startedAt, completed: last.completed, mode: `${last.config.mode} ${last.config.mode2}` }
          : null,
      };
    }
    case 'popup:sync': {
      if (!isExtensionPage(senderUrl, deps.extensionOrigin)) throw new Error('forbidden');
      if (!deps.syncDesktop) throw new Error('sync unavailable');
      return deps.syncDesktop();
    }
    case 'export': {
      if (!isExtensionPage(senderUrl, deps.extensionOrigin)) throw new Error('forbidden');
      return JSON.stringify({ v: 1, sessions: await db.all() });
    }
    case 'clear': {
      if (!isExtensionPage(senderUrl, deps.extensionOrigin)) throw new Error('forbidden');
      if (msg.confirm !== 'DELETE') throw new Error('confirmation required');
      await db.clear();
      await updateBadge(deps);
      return { ok: true };
    }
    case 'dash:changed': {
      // the dashboard page wrote to the database itself (import, delete): refresh the badge, deliver imports
      if (!isExtensionPage(senderUrl, deps.extensionOrigin)) throw new Error('forbidden');
      await updateBadge(deps);
      if (msg.deliver === true && deps.syncDesktop) void deps.syncDesktop().catch(() => undefined);
      return { ok: true };
    }
    default:
      throw new Error('unknown message');
  }
}
