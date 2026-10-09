import { KEY_DEFS, type KeyDef } from '@/data/keymap';

/* ============================================================================
 * Reusable QWERTY keyboard SVG.
 *  - Keys page uses it as a heatmap (passes getKeyStyle for metric coloring).
 *  - Replay page uses it to show currently-held keys (passes activeCodes).
 * ------------------------------------------------------------------------- */

export interface KeyStyle {
  fill?: string;
  stroke?: string;
  labelColor?: string;
  opacity?: number;
}

const UNIT = 44; // key unit in px (within the viewBox)
const GAP = 6;

export function Keyboard({
  getKeyStyle,
  onKeyClick,
  activeCodes,
  className,
}: {
  getKeyStyle?: (def: KeyDef) => KeyStyle;
  onKeyClick?: (def: KeyDef) => void;
  activeCodes?: Set<string>;
  className?: string;
}) {
  // Compute viewBox bounds.
  let maxCol = 0;
  let maxRow = 0;
  for (const k of KEY_DEFS) {
    maxCol = Math.max(maxCol, k.col + k.w);
    maxRow = Math.max(maxRow, k.rowIdx);
  }
  const vbW = maxCol * (UNIT + GAP) + GAP;
  const vbH = (maxRow + 1) * (UNIT + GAP) + GAP;

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className={className}
      role="img"
      aria-label="QWERTY keyboard"
      style={{ width: '100%', height: 'auto' }}
    >
      {KEY_DEFS.map((k) => {
        const x = GAP + k.col * (UNIT + GAP);
        const y = GAP + k.rowIdx * (UNIT + GAP);
        const w = k.w * UNIT + (k.w - 1) * GAP;
        const style = getKeyStyle?.(k) ?? {};
        const active = activeCodes?.has(k.code);
        const fill = active ? 'var(--main)' : style.fill ?? 'var(--bg-elev)';
        const stroke = active ? 'var(--main)' : style.stroke ?? 'var(--sub-2)';
        return (
          <g
            key={k.code}
            onClick={onKeyClick ? () => onKeyClick(k) : undefined}
            style={{ cursor: onKeyClick ? 'pointer' : 'default' }}
          >
            <rect
              x={x}
              y={y}
              width={w}
              height={UNIT}
              rx={6}
              fill={fill}
              stroke={stroke}
              strokeWidth={active ? 2 : 1}
              opacity={style.opacity ?? 1}
            />
            <text
              x={x + w / 2}
              y={y + UNIT / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={k.rowIdx === 4 ? 13 : 14}
              fontFamily="var(--font)"
              fill={active ? 'var(--bg)' : style.labelColor ?? 'var(--text)'}
            >
              {k.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
