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

/**
 * The colours of the theme the user has on monkeytype.com, read from the page's CSS variables (so built-in and
 * custom Monkeytype themes both work). Lets the dashboard follow the user's Monkeytype theme.
 */
export interface MonkeytypeTheme {
  /** Monkeytype's theme id ("serika_dark"), or "custom" for a custom theme */
  name: string;
  /** #rrggbb */
  bg: string;
  main: string;
  sub: string;
  subAlt: string;
  text: string;
  error: string;
}
export const MONKEYTYPE_THEME_KEYS = ['bg', 'main', 'sub', 'subAlt', 'text', 'error'] as const;

const HEX = /^#[0-9a-f]{6}$/;

/** Accepts only a well-formed theme (lower-case #rrggbb colours, short name); anything else is null. */
export function sanitizeMonkeytypeTheme(x: unknown): MonkeytypeTheme | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of MONKEYTYPE_THEME_KEYS) {
    const v = typeof r[k] === 'string' ? (r[k] as string).trim().toLowerCase() : '';
    if (!HEX.test(v)) return null;
    out[k] = v;
  }
  const name = typeof r.name === 'string' ? r.name.replace(/[^\w .-]/g, '').slice(0, 40) : '';
  return { name: name || 'custom', ...(out as Omit<MonkeytypeTheme, 'name'>) };
}

export interface DesktopHello {
  extVersion: string;
  /** last time a recorder was alive on a Monkeytype tab (ms epoch) */
  recorderSeenAt: number | null;
  health: { ok: boolean; missing: string[] } | null;
  /** the Monkeytype theme last seen on monkeytype.com (older extensions do not send it) */
  theme?: MonkeytypeTheme | null;
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
