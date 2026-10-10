/**
 * Dashboard themes. A theme is six colours, the same six Monkeytype themes are built from, so a Monkeytype theme
 * (synced by the extension) and a hand-made custom theme work exactly like the built-in ones. The CSS tokens in
 * src/index.css are derived from these six (see themeTokens).
 */
import type { MonkeytypeTheme } from '@typelens/core/desktop';
import { refreshLiveColors } from './theme';

export interface ThemePalette {
  /** page background */
  bg: string;
  /** panels, hover and raised surfaces */
  subAlt: string;
  /** secondary text, axes */
  sub: string;
  /** primary text */
  text: string;
  /** accent */
  main: string;
  /** errors */
  error: string;
}

export const PALETTE_KEYS = ['bg', 'subAlt', 'sub', 'text', 'main', 'error'] as const satisfies ReadonlyArray<keyof ThemePalette>;

export const PALETTE_LABELS: Record<keyof ThemePalette, string> = {
  bg: 'background',
  subAlt: 'panels',
  sub: 'secondary text',
  text: 'text',
  main: 'accent',
  error: 'error',
};

export interface ThemePreset {
  id: string;
  name: string;
  palette: ThemePalette;
  /** exact token values where the derived ones would differ (keeps the original TypeLens look pixel-identical) */
  overrides?: Partial<Record<ThemeToken, string>>;
}

export const DEFAULT_THEME_ID = 'typelens';

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'typelens',
    name: 'TypeLens',
    palette: { bg: '#000000', subAlt: '#141414', sub: '#5f5d5d', text: '#ffffff', main: '#ffffff', error: '#ca4754' },
    overrides: { 'sub-2': '#2b2a2a', ok: '#b5b5b5' },
  },
  { id: 'serika-dark', name: 'Serika Dark', palette: { bg: '#323437', subAlt: '#2c2e31', sub: '#646669', text: '#d1d0c5', main: '#e2b714', error: '#ca4754' } },
  { id: 'github-dark', name: 'GitHub Dark', palette: { bg: '#0d1117', subAlt: '#161b22', sub: '#7d8590', text: '#e6edf3', main: '#2f81f7', error: '#f85149' } },
  { id: 'github-light', name: 'GitHub Light', palette: { bg: '#ffffff', subAlt: '#f6f8fa', sub: '#656d76', text: '#1f2328', main: '#0969da', error: '#cf222e' } },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', palette: { bg: '#1e1e2e', subAlt: '#181825', sub: '#7f849c', text: '#cdd6f4', main: '#cba6f7', error: '#f38ba8' } },
  { id: 'catppuccin-latte', name: 'Catppuccin Latte', palette: { bg: '#eff1f5', subAlt: '#e6e9ef', sub: '#8c8fa1', text: '#4c4f69', main: '#8839ef', error: '#d20f39' } },
  { id: 'nord', name: 'Nord', palette: { bg: '#2e3440', subAlt: '#3b4252', sub: '#7b88a1', text: '#eceff4', main: '#88c0d0', error: '#bf616a' } },
  { id: 'dracula', name: 'Dracula', palette: { bg: '#282a36', subAlt: '#21222c', sub: '#6272a4', text: '#f8f8f2', main: '#bd93f9', error: '#ff5555' } },
  { id: 'gruvbox', name: 'Gruvbox', palette: { bg: '#282828', subAlt: '#1d2021', sub: '#928374', text: '#ebdbb2', main: '#fabd2f', error: '#fb4934' } },
  { id: 'tokyo-night', name: 'Tokyo Night', palette: { bg: '#1a1b26', subAlt: '#16161e', sub: '#565f89', text: '#c0caf5', main: '#7aa2f7', error: '#f7768e' } },
];

export function presetById(id: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? (THEME_PRESETS[0] as ThemePreset);
}

export function paletteFromMonkeytype(t: MonkeytypeTheme): ThemePalette {
  return { bg: t.bg, subAlt: t.subAlt, sub: t.sub, text: t.text, main: t.main, error: t.error };
}

// ---------------------------------------------------------------- tokens

export type ThemeToken = 'bg' | 'bg-dark' | 'bg-card' | 'bg-elev' | 'sub' | 'sub-2' | 'text' | 'main' | 'error' | 'ok';

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(x: unknown): x is string {
  return typeof x === 'string' && HEX.test(x);
}

/** a*w + b*(1-w) for two #rrggbb colours */
export function mixHex(a: string, b: string, w: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const c = (i: number) => Math.round(ch(a, i) * w + ch(b, i) * (1 - w)).toString(16).padStart(2, '0');
  return `#${c(1)}${c(3)}${c(5)}`;
}

/** The CSS tokens of src/index.css for a palette. */
export function themeTokens(p: ThemePalette, overrides: Partial<Record<ThemeToken, string>> = {}): Record<ThemeToken, string> {
  return {
    bg: p.bg,
    'bg-dark': p.bg,
    'bg-card': p.bg,
    'bg-elev': p.subAlt,
    sub: p.sub,
    // borders and gridlines: halfway between the secondary text and the background
    'sub-2': mixHex(p.sub, p.bg, 0.45),
    text: p.text,
    main: p.main,
    error: p.error,
    // the "good" series: a muted step from the text colour towards the secondary text
    ok: mixHex(p.text, p.sub, 0.6),
    ...overrides,
  };
}

const rgb = (hex: string): string => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');

/** Writes the tokens (hex and the `-rgb` triplets Tailwind uses) to :root and refreshes chart colours. */
export function applyPalette(p: ThemePalette, overrides?: Partial<Record<ThemeToken, string>>): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  for (const [token, hex] of Object.entries(themeTokens(p, overrides))) {
    root.setProperty(`--${token}`, hex);
    root.setProperty(`--${token}-rgb`, rgb(hex));
  }
  // native controls (scrollbars, date pickers) match light/dark themes
  const light = luminance(p.bg) > 0.5;
  root.setProperty('color-scheme', light ? 'light' : 'dark');
  refreshLiveColors();
}

/** relative luminance 0..1 */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}
