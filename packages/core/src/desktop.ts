/**
 * The contract between the browser extension and the TypeLens desktop app.
 *
 * The desktop app listens on 127.0.0.1 only. The extension's service worker pushes recorded sessions to it;
 * the app writes each one to disk before answering, so a session is only marked delivered in the extension
 * once it is safe on the user's machine. Web pages cannot use this channel: the app only accepts requests
 * whose Origin is a browser extension (pages cannot forge that header).
 */
export const DESKTOP_HOST = '127.0.0.1';
export const DESKTOP_PORT = 47615;
export const DESKTOP_ORIGIN = `http://${DESKTOP_HOST}:${DESKTOP_PORT}`;
/** Bumped only for incompatible changes to the endpoints below. */
export const DESKTOP_API = 1;

/** POST, body DesktopHello. Lets the app show "extension connected" and pairs the first extension that calls. */
export const DESKTOP_HELLO_PATH = '/v1/hello';
/** POST, body DesktopPush. */
export const DESKTOP_SESSIONS_PATH = '/v1/sessions';

/** Sessions per push request; keeps request bodies to a few MB. */
export const DESKTOP_PUSH_BATCH = 20;
/** Largest request body the app accepts. */
export const DESKTOP_MAX_BODY = 32 * 1024 * 1024;

export interface DesktopHello {
  extVersion: string;
  /** last time a recorder was alive on a Monkeytype tab (ms epoch) */
  recorderSeenAt: number | null;
  health: { ok: boolean; missing: string[] } | null;
}
export interface DesktopHelloReply {
  app: 'typelens';
  api: number;
  version: string;
}
export interface DesktopPush {
  sessions: unknown[];
}
export interface DesktopPushReply {
  /** ids that are now stored by the app (including ones it already had) */
  accepted: string[];
  rejected: { id: string | null; error: string }[];
}
