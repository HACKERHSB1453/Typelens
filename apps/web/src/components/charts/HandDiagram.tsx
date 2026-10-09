import { useMemo } from 'react';
import type { FingerStat, FingerId } from '@/data/types';
import { formatMs, formatPercent } from '@/lib/utils';
import { themeColors } from '@/lib/theme';

/* ============================================================================
 * HandDiagram — stylized SVG of two hands (Left, Right) with five finger
 * "pills" each, colored by a per-finger metric. Lower / higher values map to
 * brighter fills depending on the metric direction.
 * ------------------------------------------------------------------------- */

export type HandMetric = 'speed' | 'error' | 'hold' | 'rollover';

// Resolved from the CSS theme tokens (src/index.css) so SVG colour mixing stays in sync with the theme.
const T = themeColors();
const HEX = {
  main: T.main,
  error: T.error,
  bgDark: T.bgDark,
  bgElev: T.bgElev,
  sub: T.sub,
  sub2: T.sub2,
  text: T.text,
} as const;
interface PillPos {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Left hand sits on the left, right hand mirrored on the right. Thumbs are
// innermost (LT right of left palm, RT left of right palm).
const LAYOUT: Record<FingerId, PillPos> = {
  LP: { x: 36, y: 30, w: 22, h: 105 }, // left pinky (outermost)
  LR: { x: 64, y: 18, w: 22, h: 117 }, // left ring
  LM: { x: 92, y: 6, w: 22, h: 129 }, // left middle (longest)
  LI: { x: 120, y: 30, w: 22, h: 105 }, // left index
  LT: { x: 150, y: 178, w: 44, h: 22 }, // left thumb (innermost)
  RT: { x: 226, y: 178, w: 44, h: 22 }, // right thumb (innermost)
  RI: { x: 276, y: 30, w: 22, h: 105 }, // right index
  RM: { x: 304, y: 6, w: 22, h: 129 }, // right middle (longest)
  RR: { x: 332, y: 18, w: 22, h: 117 }, // right ring
  RP: { x: 360, y: 30, w: 22, h: 105 }, // right pinky (outermost)
};

const LEFT_PALM = { x: 30, y: 145, w: 120, h: 105, rx: 18 };
const RIGHT_PALM = { x: 270, y: 145, w: 120, h: 105, rx: 18 };

const LEFT_FINGERS: FingerId[] = ['LP', 'LR', 'LM', 'LI', 'LT'];
const RIGHT_FINGERS: FingerId[] = ['RT', 'RI', 'RM', 'RR', 'RP'];

function metricValue(s: FingerStat | undefined, m: HandMetric): number | null {
  if (!s) return null;
  switch (m) {
    case 'speed':
      return s.medianIkiMs || null;
    case 'error':
      return s.errorRate;
    case 'hold':
      return s.medianHoldMs || null;
    case 'rollover':
      return s.rolloverRate;
  }
}

function formatStat(s: FingerStat | undefined, m: HandMetric): string {
  if (!s) return 'No data';
  switch (m) {
    case 'speed':
      return `Median IKI ${formatMs(s.medianIkiMs)}`;
    case 'error':
      return `Error rate ${formatPercent(s.errorRate * 100)}`;
    case 'hold':
      return `Median hold ${formatMs(s.medianHoldMs)}`;
    case 'rollover':
      return `Rollover ${formatPercent(s.rolloverRate * 100)}`;
  }
}

interface Fill {
  fill: string;
  opacity: number;
  hasData: boolean;
}

function colorize(value: number | null, m: HandMetric, min: number, max: number): Fill {
  if (value === null || !isFinite(value)) return { fill: HEX.sub2, opacity: 0.5, hasData: false };
  const range = max - min || 1;
  const norm = Math.max(0, Math.min(1, (value - min) / range)); // 0..1
  if (m === 'speed') {
    // Lower iki = brighter main; higher iki = dim main.
    return { fill: HEX.main, opacity: 0.25 + 0.75 * (1 - norm), hasData: true };
  }
  if (m === 'error') {
    // Higher error = more error-red.
    return { fill: HEX.error, opacity: 0.2 + 0.8 * norm, hasData: true };
  }
  // hold & rollover: higher = brighter main.
  return { fill: HEX.main, opacity: 0.2 + 0.8 * norm, hasData: true };
}

export function HandDiagram({
  fingers,
  metric,
}: {
  fingers: FingerStat[];
  metric: HandMetric;
}) {
  const byId = useMemo(() => {
    const m = new Map<FingerId, FingerStat>();
    for (const f of fingers) m.set(f.finger, f);
    return m;
  }, [fingers]);

  const { min, max } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const f of fingers) {
      const v = metricValue(f, metric);
      if (v !== null && isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (!isFinite(lo)) {
      lo = 0;
      hi = 1;
    }
    return { min: lo, max: hi };
  }, [fingers, metric]);

  const renderPill = (id: FingerId) => {
    const pos = LAYOUT[id];
    const stat = byId.get(id);
    const v = metricValue(stat, metric);
    const { fill, opacity, hasData } = colorize(v, metric, min, max);
    // Label color picks contrast against the fill intensity.
    const labelColor = opacity >= 0.55 ? HEX.bgDark : HEX.text;
    const cx = pos.x + pos.w / 2;
    const cy = pos.y + pos.h / 2;
    const titleText = `${id} — ${formatStat(stat, metric)}`;
    return (
      <g key={id}>
        <title>{titleText}</title>
        <rect
          x={pos.x}
          y={pos.y}
          width={pos.w}
          height={pos.h}
          rx={11}
          fill={fill}
          fillOpacity={opacity}
          stroke={HEX.sub2}
          strokeWidth={1}
        />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="11"
          fontWeight={600}
          fill={labelColor}
          opacity={hasData ? 1 : 0.7}
        >
          {id}
        </text>
      </g>
    );
  };

  return (
    <svg
      viewBox="0 0 420 285"
      className="mx-auto block w-full max-w-xl"
      role="img"
      aria-label="Hand diagram colored by the selected metric"
    >
      {/* Palms */}
      <rect
        x={LEFT_PALM.x}
        y={LEFT_PALM.y}
        width={LEFT_PALM.w}
        height={LEFT_PALM.h}
        rx={LEFT_PALM.rx}
        fill={HEX.bgElev}
        stroke={HEX.sub2}
        strokeWidth={1}
      />
      <rect
        x={RIGHT_PALM.x}
        y={RIGHT_PALM.y}
        width={RIGHT_PALM.w}
        height={RIGHT_PALM.h}
        rx={RIGHT_PALM.rx}
        fill={HEX.bgElev}
        stroke={HEX.sub2}
        strokeWidth={1}
      />
      {/* Finger pills */}
      {LEFT_FINGERS.map(renderPill)}
      {RIGHT_FINGERS.map(renderPill)}
      {/* Hand labels */}
      <text x={90} y={275} textAnchor="middle" fontSize="12" fill={HEX.sub}>
        Left hand
      </text>
      <text x={330} y={275} textAnchor="middle" fontSize="12" fill={HEX.sub}>
        Right hand
      </text>
    </svg>
  );
}
