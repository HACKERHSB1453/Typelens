/**
 * Client side of the TypeLens extension bridge. The extension's bridge content script (injected only on
 * this app's origin) answers four whitelisted actions over window.postMessage — see
 * apps/extension/src/protocol.ts. This app never gets raw access to chrome.* or the extension's database.
 */
import { sanitizeMonkeytypeTheme, type MonkeytypeTheme } from '@typelens/core/desktop';

const CHANNEL = 'typelens';

export type BridgeAction = 'ping' | 'list' | 'get' | 'ack';

export interface Bridge {
  request<T>(action: BridgeAction, payload?: { after?: number; ids?: string[] }): Promise<T>;
  /** true when the extension answered a ping */
  ping(): Promise<boolean>;
  /** the Monkeytype theme the extension last saw (null when unknown or the extension is absent) */
  monkeytypeTheme(): Promise<MonkeytypeTheme | null>;
}

interface Reply {
  channel: string;
  id: string;
  reply: true;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export function createBridge(win: Window = window, timeoutMs = 2500): Bridge {
  const request = <T,>(action: BridgeAction, payload?: { after?: number; ids?: string[] }): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        win.removeEventListener('message', onMessage);
        reject(new Error('The TypeLens extension did not answer. Load it in chrome://extensions (Developer mode, Load unpacked, pick apps/extension/dist), then reload this page.'));
      }, timeoutMs);
      function onMessage(ev: MessageEvent): void {
        const d = ev.data as Partial<Reply> | null;
        // only our own window and origin, and only the reply to THIS request
        if (ev.source !== win || ev.origin !== win.location.origin) return;
        if (!d || d.channel !== CHANNEL || d.reply !== true || d.id !== id) return;
        clearTimeout(timer);
        win.removeEventListener('message', onMessage);
        if (d.ok) resolve(d.data as T);
        else reject(new Error(d.error ?? 'extension error'));
      }
      win.addEventListener('message', onMessage);
      win.postMessage({ channel: CHANNEL, id, action, payload }, win.location.origin);
    });

  return {
    request,
    async ping() {
      try {
        const r = await request<{ ok?: boolean }>('ping');
        return r?.ok === true;
      } catch {
        return false;
      }
    },
    async monkeytypeTheme() {
      try {
        return sanitizeMonkeytypeTheme((await request<{ theme?: unknown }>('ping'))?.theme);
      } catch {
        return null;
      }
    },
  };
}
