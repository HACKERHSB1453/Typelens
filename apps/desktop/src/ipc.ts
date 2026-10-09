/**
 * Argument validation for the IPC handlers. The renderer is treated as untrusted input: every value that
 * crosses the bridge is checked here before the main process acts on it (paths, URLs, sizes, shapes).
 * Pure functions, no Electron imports, so they are unit-tested.
 */
import type { FileFilter } from '@typelens/host-contract';
export { CHANNELS } from './channels';

export class IpcArgError extends Error {}

const fail = (what: string): never => {
  throw new IpcArgError(`invalid argument: ${what}`);
};

export const MAX_PREF_BYTES = 1_000_000;
export const MAX_PUT_SESSIONS = 5_000;
export const MAX_EXPORT_BYTES = 512 * 1024 * 1024;
const PREF_KEY = /^[A-Za-z0-9._-]{1,64}$/;

export function asId(x: unknown): string {
  return typeof x === 'string' && x.length > 0 && x.length <= 200 ? x : fail('id');
}

export function asIds(x: unknown, max = 100_000): string[] {
  if (!Array.isArray(x) || x.length > max) return fail('ids');
  return x.map(asId);
}

export function asBool(x: unknown): boolean {
  return typeof x === 'boolean' ? x : fail('boolean');
}

export function asPrefKey(x: unknown): string {
  return typeof x === 'string' && PREF_KEY.test(x) ? x : fail('preference key');
}

/** Any JSON value, kept small; `null`/`undefined` mean "remove". */
export function asPrefValue(x: unknown): unknown {
  if (x === null || x === undefined) return null;
  let text: string | undefined;
  try {
    text = JSON.stringify(x);
  } catch {
    return fail('preference value is not JSON');
  }
  if (text === undefined || text.length > MAX_PREF_BYTES) return fail('preference value');
  return JSON.parse(text) as unknown;
}

/** Shape and count only; the session store runs the full validateSession on every one. */
export function asSessionList(x: unknown): unknown[] {
  if (!Array.isArray(x) || x.length > MAX_PUT_SESSIONS) return fail('sessions');
  return x;
}

export function asHttpsUrl(x: unknown): string {
  if (typeof x !== 'string' || x.length > 2048) return fail('url');
  let u: URL;
  try {
    u = new URL(x);
  } catch {
    return fail('url');
  }
  return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : fail('only https links can be opened');
}

/** A bare file name for the save dialog's default: no directories, no control characters. */
export function asFileName(x: unknown): string {
  if (typeof x !== 'string') return fail('file name');
  // eslint-disable-next-line no-control-regex
  const base = x.split(/[\\/]/).pop()!.replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim().slice(0, 120);
  return base && base !== '.' && base !== '..' ? base : 'typelens-export';
}

export function asFileFilters(x: unknown): FileFilter[] {
  if (x === undefined || x === null) return [];
  if (!Array.isArray(x) || x.length > 8) return fail('file filters');
  return x.map((f) => {
    const o = f as Partial<FileFilter> | null;
    if (!o || typeof o.name !== 'string' || o.name.length > 60 || !Array.isArray(o.extensions) || o.extensions.length > 8) return fail('file filter');
    const extensions = o.extensions.map((e) => (typeof e === 'string' && /^[A-Za-z0-9]{1,10}$/.test(e) ? e : fail('file extension')));
    return { name: o.name, extensions };
  });
}

export function asExportContent(x: unknown): string {
  return typeof x === 'string' && x.length <= MAX_EXPORT_BYTES ? x : fail('export content');
}

/**
 * True when an IPC call comes from our own page: the app://typelens dashboard, or (dev only) the Vite dev server.
 * `trusted` holds "scheme://host[:port]" strings. URL.origin is "null" for custom schemes, so compare the parts.
 */
export function isTrustedSender(frameUrl: string | undefined, trusted: string[]): boolean {
  if (!frameUrl) return false;
  try {
    const u = new URL(frameUrl);
    return u.host !== '' && trusted.includes(`${u.protocol}//${u.host}`);
  } catch {
    return false;
  }
}
