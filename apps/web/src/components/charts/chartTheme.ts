import { Chart, registerables } from 'chart.js';
import { fontFamily, themeColors } from '@/lib/theme';

/* ============================================================================
 * Chart.js theme — mirrors the TypeLens CSS tokens.
 * Canvas can't resolve CSS variables, so they are read once from src/index.css (see lib/theme.ts).
 * ------------------------------------------------------------------------- */

Chart.register(...registerables);

const T = themeColors();

export const CHART_COLORS = {
  bg: T.bgDark,
  text: T.text,
  sub: T.sub,
  grid: T.sub2,
  main: T.main,
  error: T.error,
  ok: T.ok,
  // extra series: the theme is monochrome + red, so further series are steps of grey
  accent2: '#7a7878',
  accent3: '#4a4848',
} as const;

Chart.defaults.color = CHART_COLORS.sub;
Chart.defaults.borderColor = CHART_COLORS.grid;
Chart.defaults.font.family = fontFamily();
Chart.defaults.font.size = 11;
export const gridStyle = {
  color: CHART_COLORS.grid,
  drawTicks: false,
} as const;

export const tickStyle = {
  color: CHART_COLORS.sub,
  padding: 6,
} as const;
