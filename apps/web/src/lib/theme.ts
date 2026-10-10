/**
 * Resolved theme colours for places that cannot use CSS variables directly (canvas charts, SVG colour
 * mixing). The single source of truth stays src/index.css; these are read from it at runtime, so changing
 * the theme there changes everything. The fallbacks only apply if the stylesheet is not loaded yet.
 */
export interface ThemeColors {
  bg: string;
  bgDark: string;
  bgElev: string;
  sub: string;
  sub2: string;
  text: string;
  main: string;
  error: string;
  ok: string;
}

const FALLBACK: ThemeColors = {
  bg: '#000000',
  bgDark: '#000000',
  bgElev: '#141414',
  sub: '#5f5d5d',
  sub2: '#2b2a2a',
  text: '#ffffff',
  main: '#ffffff',
  error: '#ca4754',
  ok: '#b5b5b5',
};

export function themeColors(): ThemeColors {
  if (typeof document === 'undefined') return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string): string => cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: v('--bg', FALLBACK.bg),
    bgDark: v('--bg-dark', FALLBACK.bgDark),
    bgElev: v('--bg-elev', FALLBACK.bgElev),
    sub: v('--sub', FALLBACK.sub),
    sub2: v('--sub-2', FALLBACK.sub2),
    text: v('--text', FALLBACK.text),
    main: v('--main', FALLBACK.main),
    error: v('--error', FALLBACK.error),
    ok: v('--ok', FALLBACK.ok),
  };
}

export function fontFamily(): string {
  if (typeof document === 'undefined') return 'Hack, monospace';
  return getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'Hack, monospace';
}

/**
 * The current theme colours as one shared object, updated in place when the theme changes (refreshLiveColors),
 * so modules that hold on to it (chart defaults, SVG fills) always read the active theme.
 */
export const liveColors: ThemeColors = themeColors();

const listeners = new Set<() => void>();

/** Re-reads the CSS tokens after a theme change and notifies subscribers (chart defaults). */
export function refreshLiveColors(): void {
  Object.assign(liveColors, themeColors());
  listeners.forEach((l) => l());
}

export function onLiveColorsChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
