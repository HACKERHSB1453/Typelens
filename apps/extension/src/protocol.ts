/**
 * Message shapes shared by background, bridge and popup.
 * `Bridge*` is what a web page may post to the bridge content script; only these four actions exist,
 * so the web app never gets raw access to chrome.* or to the database.
 */
import type { Session } from '@typelens/core/schema';

export const BRIDGE_CHANNEL = 'typelens';
export const BRIDGE_ACTIONS = ['ping', 'list', 'get', 'ack'] as const;
export type BridgeAction = (typeof BRIDGE_ACTIONS)[number];

export interface BridgeRequest {
  channel: typeof BRIDGE_CHANNEL;
  id: string;
  action: BridgeAction;
  payload?: { after?: number; ids?: string[] };
}
export interface BridgeReply {
  channel: typeof BRIDGE_CHANNEL;
  id: string;
  reply: true;
  ok: boolean;
  data?: unknown;
  error?: string;
}
/** Posted once by the bridge when it loads, so the page can show "extension connected" without polling. */
export interface BridgeReady {
  channel: typeof BRIDGE_CHANNEL;
  type: 'ready';
  version: string;
}

export type Msg =
  | { type: 'session'; session: Session }
  | { type: 'sync:ping' }
  | { type: 'sync:list'; after?: number }
  | { type: 'sync:get'; ids: string[] }
  | { type: 'sync:ack'; ids: string[] }
  | { type: 'popup:state' }
  | { type: 'popup:sync' }
  | { type: 'export' }
  | { type: 'clear'; confirm: string };

/** Max sessions returned by one sync:get call (keeps message sizes sane). */
export const SYNC_BATCH = 20;
