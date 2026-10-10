/**
 * The chosen theme: one shared store for the Settings page and the app shell.
 *
 * The choice is saved in the host's preferences (PREF_THEME). A copy also goes to localStorage, only so the next
 * start can paint the right colours before the (async) preferences have loaded; the preference stays the source of
 * truth. In "monkeytype" mode the last theme the extension reported is kept too, so the app looks right even when
 * the extension has not been in touch yet.
 */
import { useSyncExternalStore } from 'react';
import { sanitizeMonkeytypeTheme, type MonkeytypeTheme } from '@typelens/core/desktop';
import { PREF_THEME } from '@typelens/host-contract';
import { getHost } from '@/host';
import {
  applyPalette,
  DEFAULT_THEME_ID,
  isHexColor,
  PALETTE_KEYS,
  paletteFromMonkeytype,
  presetById,
  THEME_PRESETS,
  type ThemePalette,
  type ThemeToken,
} from './themes';

export type ThemeMode = 'preset' | 'monkeytype' | 'custom';

export interface ThemeSettings {
  mode: ThemeMode;
  /** the built-in theme (also what "monkeytype" mode shows until a Monkeytype theme is known) */
  preset: string;
  custom: ThemePalette;
  /** the last Monkeytype theme the extension reported */
  monkeytype: MonkeytypeTheme | null;
}

const CACHE_KEY = 'typelens.theme.cache';

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  mode: 'preset',
  preset: DEFAULT_THEME_ID,
  custom: { ...presetById(DEFAULT_THEME_ID).palette },
  monkeytype: null,
};

function sanitizePalette(x: unknown, fallback: ThemePalette): ThemePalette {
  const r = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
  const out = { ...fallback };
  for (const k of PALETTE_KEYS) if (isHexColor(r[k])) out[k] = (r[k] as string).toLowerCase();
  return out;
}

/** Trusts nothing that was stored: an old or hand-edited value falls back field by field. */
export function sanitizeThemeSettings(x: unknown): ThemeSettings {
  const r = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
  const mode: ThemeMode = r.mode === 'monkeytype' || r.mode === 'custom' ? r.mode : 'preset';
  const preset = typeof r.preset === 'string' && THEME_PRESETS.some((p) => p.id === r.preset) ? r.preset : DEFAULT_THEME_ID;
  return {
    mode,
    preset,
    custom: sanitizePalette(r.custom, DEFAULT_THEME_SETTINGS.custom),
    monkeytype: sanitizeMonkeytypeTheme(r.monkeytype),
  };
}

/** What the screen shows for these settings. */
export function activeTheme(s: ThemeSettings): { palette: ThemePalette; overrides?: Partial<Record<ThemeToken, string>> } {
  if (s.mode === 'custom') return { palette: s.custom };
  if (s.mode === 'monkeytype' && s.monkeytype) return { palette: paletteFromMonkeytype(s.monkeytype) };
  const p = presetById(s.preset);
  return p.overrides ? { palette: p.palette, overrides: p.overrides } : { palette: p.palette };
}

// ---------------------------------------------------------------- store

let state: ThemeSettings = DEFAULT_THEME_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

function readCache(): ThemeSettings | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? sanitizeThemeSettings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeCache(s: ThemeSettings): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {
    /* only a start-up convenience */
  }
}

/** Bumps only when the colours on screen change, for remounting canvas charts that cache colours. */
let version = 0;
let paintedKey = '';

function commit(next: ThemeSettings, persist: boolean): void {
  state = next;
  const active = activeTheme(next);
  const key = JSON.stringify(active);
  if (key !== paintedKey) {
    paintedKey = key;
    version++;
    applyPalette(active.palette, active.overrides);
  }
  writeCache(next);
  if (persist) getHost().prefs.set(PREF_THEME, next).catch(() => undefined);
  listeners.forEach((l) => l());
}

/** Paints the cached theme synchronously (call before the first render), then loads the saved preference. */
export function initTheme(): void {
  const cached = readCache();
  if (cached) commit(cached, false);
  getHost()
    .prefs.get<unknown>(PREF_THEME)
    .then((saved) => {
      loaded = true;
      if (saved !== null) commit(sanitizeThemeSettings(saved), false);
    })
    .catch(() => {
      loaded = true;
    });
}

export function getThemeSettings(): ThemeSettings {
  return state;
}

export function updateThemeSettings(patch: Partial<ThemeSettings>): void {
  commit(sanitizeThemeSettings({ ...state, ...patch }), true);
}

/** The extension reported a Monkeytype theme: remember it (and show it, in "monkeytype" mode). */
export function receiveMonkeytypeTheme(theme: MonkeytypeTheme | null): void {
  if (!theme || !loaded) return;
  if (JSON.stringify(theme) === JSON.stringify(state.monkeytype)) return;
  updateThemeSettings({ monkeytype: theme });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useThemeSettings(): ThemeSettings {
  return useSyncExternalStore(subscribe, getThemeSettings, getThemeSettings);
}

export function useThemeVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}
