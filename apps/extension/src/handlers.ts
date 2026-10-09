/**
 * Background message handling, written as a pure function over injected dependencies so it can be
 * unit-tested without chrome.*. Every message type is authorised by WHO sent it:
 *   session       <- monkeytype.com tabs only
 *   sync:*        <- the web-app origins only (via the bridge content script)
 *   popup/export/clear/popup:sync <- extension pages only
 */
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
}

const isExtensionPage = (url: string | undefined): boolean => !!url && url.startsWith('chrome-extension://');

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
        const st = await deps.storage.get(['recorderSeenAt', 'health']);
        return { ok: true, version: deps.extVersion, recorderSeenAt: typeof st.recorderSeenAt === 'number' ? st.recorderSeenAt : null, health: st.health ?? null };
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
      if (!isExtensionPage(senderUrl)) throw new Error('forbidden');
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
      if (!isExtensionPage(senderUrl)) throw new Error('forbidden');
      if (!deps.syncDesktop) throw new Error('sync unavailable');
      return deps.syncDesktop();
    }
    case 'export': {
      if (!isExtensionPage(senderUrl)) throw new Error('forbidden');
      return JSON.stringify({ v: 1, sessions: await db.all() });
    }
    case 'clear': {
      if (!isExtensionPage(senderUrl)) throw new Error('forbidden');
      if (msg.confirm !== 'DELETE') throw new Error('confirmation required');
      await db.clear();
      await updateBadge(deps);
      return { ok: true };
    }
    default:
      throw new Error('unknown message');
  }
}
