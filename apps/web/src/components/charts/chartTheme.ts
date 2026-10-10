import { Chart, registerables } from 'chart.js';
import { fontFamily, liveColors, onLiveColorsChange } from '@/lib/theme';

/* ============================================================================
 * Chart.js theme — mirrors the TypeLens CSS tokens.
 * Canvas cannot resolve CSS variables, so the colours come from lib/theme.ts (liveColors), which follows the
 * active theme.
 * ------------------------------------------------------------------------- */

Chart.register(...registerables);

/** Chart colours. Getters read the active theme, so a theme change applies without reloading the module. */
export const CHART_COLORS = {
  get bg() {
    return liveColors.bgDark;
  },
  get text() {
    return liveColors.text;
  },
  get sub() {
    return liveColors.sub;
  },
  get grid() {
    return liveColors.sub2;
  },
  get main() {
    return liveColors.main;
  },
  get error() {
    return liveColors.error;
  },
  get ok() {
    return liveColors.ok;
  },
  // extra series: themes are an accent + greys, so further series are steps between text and the background
  get accent2() {
    return mix(liveColors.text, liveColors.bg, 0.45);
  },
  get accent3() {
    return mix(liveColors.text, liveColors.bg, 0.25);
  },
};

function applyDefaults(): void {
  Chart.defaults.color = CHART_COLORS.sub;
  Chart.defaults.borderColor = CHART_COLORS.grid;
}
applyDefaults();
onLiveColorsChange(applyDefaults);
Chart.defaults.font.family = fontFamily();
Chart.defaults.font.size = 11;

export const gridStyle = {
  get color() {
    return CHART_COLORS.grid;
  },
  drawTicks: false,
};

export const tickStyle = {
  get color() {
    return CHART_COLORS.sub;
  },
  padding: 6,
};

/** a*w + b*(1-w) for two #rrggbb colours */
function mix(a: string, b: string, w: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16) || 0;
  const c = (i: number) => Math.round(p(a, i) * w + p(b, i) * (1 - w)).toString(16).padStart(2, '0');
  return a.length === 7 && b.length === 7 ? `#${c(1)}${c(3)}${c(5)}` : a;
}
