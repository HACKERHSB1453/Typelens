/**
 * Single source of truth for the web-app origins the extension will talk to.
 * The manifest generator (build.mjs) reads this file, so a new origin needs exactly one edit here.
 * Only these origins get the bridge content script — never `<all_urls>`.
 */
export const BRIDGE_ORIGINS: readonly string[] = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export const MONKEYTYPE_ORIGIN = 'https://monkeytype.com';

export function isBridgeOrigin(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return BRIDGE_ORIGINS.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

export function isMonkeytypeUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).origin === MONKEYTYPE_ORIGIN;
  } catch {
    return false;
  }
}
