/** App-level settings the main process owns (not the dashboard's preferences): window, pairing, toggles. */
import fs from 'node:fs';
import { writeFileAtomicSync } from './fsutil';

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface Settings {
  window: WindowState | null;
  /** the one browser extension allowed to push tests (trust on first use) */
  pairedExtensionId: string | null;
  startAtLogin: boolean;
  notifyOnNewTest: boolean;
}

export const DEFAULT_SETTINGS: Settings = { window: null, pairedExtensionId: null, startAtLogin: false, notifyOnNewTest: true };

export interface SettingsStore {
  get(): Settings;
  update(patch: Partial<Settings>): void;
}

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Reads whatever is on disk but trusts none of it: a hand-edited or damaged file must not break startup. */
export function sanitize(raw: unknown): Settings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const w = r.window && typeof r.window === 'object' ? (r.window as Record<string, unknown>) : null;
  return {
    window:
      w && num(w.width) && num(w.height)
        ? { width: w.width, height: w.height, maximized: w.maximized === true, ...(num(w.x) && num(w.y) ? { x: w.x, y: w.y } : {}) }
        : null,
    pairedExtensionId: typeof r.pairedExtensionId === 'string' && /^[a-z0-9-]{1,64}$/i.test(r.pairedExtensionId) ? r.pairedExtensionId.toLowerCase() : null,
    startAtLogin: r.startAtLogin === true,
    notifyOnNewTest: r.notifyOnNewTest !== false,
  };
}

export function createSettings(file: string): SettingsStore {
  let current: Settings;
  try {
    current = sanitize(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    current = { ...DEFAULT_SETTINGS };
  }
  return {
    get: () => current,
    update(patch) {
      current = { ...current, ...patch };
      try {
        writeFileAtomicSync(file, JSON.stringify(current, null, 2));
      } catch {
        /* a read-only profile folder must not crash the app; the setting just will not persist */
      }
    },
  };
}
