/**
 * Runs ONLY on the web-app origins (see bridge-origins.ts). Relays four whitelisted actions between
 * the page (window.postMessage) and the background worker. The page never touches chrome.* directly.
 */
import { BRIDGE_ACTIONS, BRIDGE_CHANNEL, type BridgeReady, type BridgeReply, type BridgeRequest, type Msg } from '../protocol';

function reply(id: string, ok: boolean, data?: unknown, error?: string): void {
  const r: BridgeReply = { channel: BRIDGE_CHANNEL, id, reply: true, ok, data, error };
  window.postMessage(r, location.origin);
}

function toMsg(req: BridgeRequest): Msg | null {
  switch (req.action) {
    case 'ping':
      return { type: 'sync:ping' };
    case 'list':
      return { type: 'sync:list', after: typeof req.payload?.after === 'number' ? req.payload.after : undefined };
    case 'get':
      return { type: 'sync:get', ids: Array.isArray(req.payload?.ids) ? req.payload.ids : [] };
    case 'ack':
      return { type: 'sync:ack', ids: Array.isArray(req.payload?.ids) ? req.payload.ids : [] };
    default:
      return null;
  }
}

window.addEventListener('message', (ev: MessageEvent) => {
  // only our own window, only our own origin, only well-formed requests
  if (ev.source !== window || ev.origin !== location.origin) return;
  const d = ev.data as Partial<BridgeRequest> & { reply?: boolean };
  if (!d || d.channel !== BRIDGE_CHANNEL || d.reply || typeof d.id !== 'string') return;
  if (!d.action || !(BRIDGE_ACTIONS as readonly string[]).includes(d.action)) return;
  const msg = toMsg(d as BridgeRequest);
  if (!msg) return;
  chrome.runtime.sendMessage(msg).then(
    (res: { error?: string } | undefined) => {
      if (res && typeof res === 'object' && 'error' in res && res.error) reply(d.id as string, false, undefined, res.error);
      else reply(d.id as string, true, res);
    },
    (err: unknown) => reply(d.id as string, false, undefined, err instanceof Error ? err.message : String(err)),
  );
});

const ready: BridgeReady = { channel: BRIDGE_CHANNEL, type: 'ready', version: chrome.runtime.getManifest().version };
window.postMessage(ready, location.origin);
