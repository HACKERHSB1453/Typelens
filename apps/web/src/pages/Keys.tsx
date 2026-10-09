import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilters } from '@/hooks/useFilters';
import { useAnalysis } from '@/hooks/useData';
import { Keyboard, type KeyStyle } from '@/components/keyboard/Keyboard';
import { KEY_BY_CODE, FINGER_INFO, type KeyDef } from '@/data/keymap';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Segmented';
import { StateView } from '@/components/ui/StateView';
import { SortableTable, type Column } from '@/components/ui/SortableTable';
import { formatMs, formatNumber, formatPercent, clamp } from '@/lib/utils';
import type { KeyStat } from '@/data/types';

/* ============================================================================
 * Keys page — interactive QWERTY heatmap + key inspector + sortable table.
 * Route: /keys
 * ------------------------------------------------------------------------- */

type Metric = 'speed' | 'error' | 'hold' | 'count';

const METRIC_OPTIONS: Array<{ value: Metric; label: string; title: string }> = [
  { value: 'speed', label: 'Speed', title: 'Median inter-key interval — lower iki = faster = brighter' },
  { value: 'error', label: 'Error', title: 'Error rate — higher = brighter (red)' },
  { value: 'hold', label: 'Hold', title: 'Median hold time — higher = brighter' },
  { value: 'count', label: 'Count', title: 'Total key presses — higher = brighter' },
];

const METRIC_META: Record<
  Metric,
  { label: string; left: string; right: string; color: string; inverse: boolean }
> = {
  speed: {
    label: 'Median inter-key interval — lower iki (faster) is brighter.',
    left: 'fast',
    right: 'slow',
    color: 'var(--main)',
    inverse: true,
  },
  error: {
    label: 'Error rate — higher error rate is brighter.',
    left: 'low',
    right: 'high',
    color: 'var(--error)',
    inverse: false,
  },
  hold: {
    label: 'Median hold time — longer hold is brighter.',
    left: 'short',
    right: 'long',
    color: 'var(--main)',
    inverse: false,
  },
  count: {
    label: 'Total key presses — higher count is brighter.',
    left: 'few',
    right: 'many',
    color: 'var(--main)',
    inverse: false,
  },
};

function metricValue(k: KeyStat, m: Metric): number {
  switch (m) {
    case 'speed':
      return k.medianIkiMs;
    case 'error':
      return k.errorRate;
    case 'hold':
      return k.medianHoldMs;
    case 'count':
      return k.count;
  }
}

/** Normalised brightness in [0,1]; 1 = brightest. For `speed` lower iki = brighter. */
function metricT(v: number, min: number, max: number, m: Metric): number {
  if (max <= min) return 0.5;
  if (m === 'speed') return (max - v) / (max - min);
  return (v - min) / (max - min);
}

/** Friendly label for a key — prefers the keycap label (e.g. "space" for Space). */
function keyLabel(code: string, fallback: string): string {
  return KEY_BY_CODE[code]?.label ?? fallback ?? code;
}

/** Render a single character as a short readable token (space → ␣). */
function charToken(s: string): string {
  return s === ' ' ? '␣' : s;
}

const TABLE_COLUMNS: Column<KeyStat>[] = [
  {
    key: 'char',
    header: 'Char',
    cell: (k) => <span className="font-semibold text-[var(--text)]">{keyLabel(k.code, k.char)}</span>,
  },
  {
    key: 'code',
    header: 'Code',
    cell: (k) => <code className="text-xs text-[var(--sub)]">{k.code}</code>,
  },
  {
    key: 'finger',
    header: 'Finger',
    cell: (k) => FINGER_INFO[k.finger].name,
  },
  {
    key: 'hand',
    header: 'Hand',
    cell: (k) => (k.hand === 'L' ? 'Left' : 'Right'),
  },
  {
    key: 'row',
    header: 'Row',
    cell: (k) => <span className="capitalize">{k.row}</span>,
  },
  {
    key: 'count',
    header: 'Count',
    cell: (k) => formatNumber(k.count),
    sortValue: (k) => k.count,
    align: 'right',
  },
  {
    key: 'errorRate',
    header: 'Error %',
    cell: (k) => formatPercent(k.errorRate * 100, 1),
    sortValue: (k) => k.errorRate,
    align: 'right',
  },
  {
    key: 'medianIkiMs',
    header: 'Median iki',
    cell: (k) => formatMs(k.medianIkiMs),
    sortValue: (k) => k.medianIkiMs,
    align: 'right',
  },
  {
    key: 'medianHoldMs',
    header: 'Median hold',
    cell: (k) => formatMs(k.medianHoldMs),
    sortValue: (k) => k.medianHoldMs,
    align: 'right',
  },
  {
    key: 'confusions',
    header: 'Confusions',
    cell: (k) => (
      <div className="flex flex-wrap gap-1">
        {k.confusions.slice(0, 3).map((c, i) => (
          <Badge key={`${c.typed}-${i}`} tone="error">
            {`${keyLabel(k.code, k.char)}→${charToken(c.typed)}×${c.count}`}
          </Badge>
        ))}
        {k.confusions.length === 0 && <span className="text-xs text-[var(--sub)]">—</span>}
      </div>
    ),
  },
];

export function Keys() {
  const { filters } = useFilters();
  const { data: analysis, loading, error, retry } = useAnalysis(filters);
  const navigate = useNavigate();

  const [metric, setMetric] = useState<Metric>('speed');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  // code -> KeyStat, plus min/max for the active metric (drives heatmap color scale).
  const stats = useMemo(() => {
    const byCode = new Map<string, KeyStat>();
    let min = Infinity;
    let max = -Infinity;
    if (analysis) {
      for (const k of analysis.keys) {
        byCode.set(k.code, k);
        const v = metricValue(k, metric);
        if (Number.isFinite(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 1;
    }
    if (max <= min) max = min + 1;
    return { byCode, min, max };
  }, [analysis, metric]);

  const selectedStat = selectedCode ? stats.byCode.get(selectedCode) ?? null : null;
  const selectedDef = selectedCode ? KEY_BY_CODE[selectedCode] ?? null : null;
  const activeCodes = selectedCode ? new Set([selectedCode]) : undefined;

  const handleKeyClick = useCallback((def: KeyDef) => setSelectedCode(def.code), []);

  const getKeyStyle = useCallback(
    (def: KeyDef): KeyStyle => {
      const stat = stats.byCode.get(def.code);
      if (!stat) {
        // Below the minSamples threshold or never typed.
        return { fill: 'var(--bg-elev)', opacity: 0.25 };
      }
      const v = metricValue(stat, metric);
      const t = metricT(v, stats.min, stats.max, metric);
      const opacity = clamp(0.3 + 0.7 * t, 0.25, 1);
      const fill = metric === 'error' ? 'var(--error)' : 'var(--main)';
      // the accent can be white: a bright key needs a dark label or the letter disappears
      const labelColor = metric !== 'error' && opacity > 0.55 ? 'var(--bg)' : 'var(--text)';
      return { fill, opacity, labelColor };
    },
    [stats, metric],
  );

  const goToPractice = useCallback(
    (code: string) => {
      navigate(`/practice?focus=keys&codes=${encodeURIComponent(code)}`);
    },
    [navigate],
  );

  const meta = METRIC_META[metric];
  const gradient = meta.inverse
    ? `linear-gradient(to right, ${meta.color} 0%, transparent 100%)`
    : `linear-gradient(to right, transparent 0%, ${meta.color} 100%)`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Keys</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Heatmap (main, 2/3) */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Keyboard heatmap"
            subtitle="Click any key to inspect its stats and confusions."
            right={
              <Segmented<Metric>
                value={metric}
                onChange={setMetric}
                options={METRIC_OPTIONS}
                ariaLabel="Heatmap metric"
              />
            }
          />
          <StateView
            loading={loading}
            error={error}
            empty={!analysis || analysis.keys.length === 0}
            onRetry={retry}
            emptyTitle="No keys"
            emptyHint="No keystrokes match the current filters. Try widening the range or lowering Min samples."
          >
            {analysis && (
              <div className="flex flex-col gap-3">
                <Keyboard
                  getKeyStyle={getKeyStyle}
                  onKeyClick={handleKeyClick}
                  activeCodes={activeCodes}
                />
                {/* Legend: low ───── high gradient bar with the active metric's color. */}
                <div className="flex items-center gap-3 text-xs text-[var(--sub)]">
                  <span className="w-10 text-right">{meta.left}</span>
                  <div
                    className="h-2 flex-1 rounded"
                    style={{ background: gradient }}
                    aria-hidden
                  />
                  <span className="w-10">{meta.right}</span>
                </div>
                <p className="text-xs text-[var(--sub)]">{meta.label} Dim keys have no recorded data.</p>
              </div>
            )}
          </StateView>
        </Card>

        {/* Side panel — key inspector (right, 1/3) */}
        <Card className="lg:col-span-1">
          <CardHeader
            title="Key inspector"
            subtitle={selectedDef ? selectedDef.code : undefined}
          />
          {selectedDef ? (
            <KeyInspector
              def={selectedDef}
              stat={selectedStat}
              onPractice={goToPractice}
            />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-[var(--sub-2)] text-xs text-[var(--sub)]">
              Click a key to inspect.
            </div>
          )}
        </Card>

        {/* Full-width sortable table */}
        <Card className="lg:col-span-3">
          <CardHeader title="All keys" subtitle="Per-key breakdown across the filtered sessions." />
          <StateView
            loading={loading}
            error={error}
            empty={!analysis || analysis.keys.length === 0}
            onRetry={retry}
            emptyTitle="No keys"
            emptyHint="No keystrokes match the current filters."
          >
            {analysis && (
              <SortableTable<KeyStat>
                columns={TABLE_COLUMNS}
                rows={analysis.keys}
                rowKey={(k) => k.code}
                onRowClick={(k) => setSelectedCode(k.code)}
                maxRowsVisible={12}
                initialSort={{ key: 'count', dir: 'desc' }}
                emptyHint="No keys."
              />
            )}
          </StateView>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Side panel — shows the selected key's identity + stats + confusions + CTA.
 * ------------------------------------------------------------------------- */

function KeyInspector({
  def,
  stat,
  onPractice,
}: {
  def: KeyDef;
  stat: KeyStat | null;
  onPractice: (code: string) => void;
}) {
  const finger = FINGER_INFO[def.finger];
  const bigLabel = def.label;
  const bigClass = bigLabel.length > 2 ? 'text-sm' : 'text-2xl';

  return (
    <div className="flex flex-col gap-3">
      {/* Keycap + identity */}
      <div className="flex items-center gap-3">
        <div className="flex h-14 min-w-14 items-center justify-center rounded-md border border-main/50 bg-main/10 px-2 font-bold text-main">
          <span className={bigClass}>{bigLabel}</span>
        </div>
        <div className="min-w-0 text-xs text-[var(--sub)]">
          <div className="truncate font-mono text-[var(--text)]">{def.code}</div>
          <div>
            {finger.name} · {def.hand === 'L' ? 'Left' : 'Right'} hand ·{' '}
            <span className="capitalize">{def.row}</span> row
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-2">
        <InspectorStat label="Count" value={stat ? formatNumber(stat.count) : '—'} />
        <InspectorStat
          label="Error rate"
          value={stat ? formatPercent(stat.errorRate * 100, 1) : '—'}
          tone={stat && stat.errorRate > 0.05 ? 'error' : undefined}
        />
        <InspectorStat label="Median iki" value={stat ? formatMs(stat.medianIkiMs) : '—'} />
        <InspectorStat label="Median hold" value={stat ? formatMs(stat.medianHoldMs) : '—'} />
      </div>

      {/* Confusions */}
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--sub)]">
          Confusions
        </div>
        {stat && stat.confusions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {stat.confusions.map((c, i) => (
              <Badge key={`${c.typed}-${i}`} tone="error">
                {`${bigLabel}→${charToken(c.typed)}×${c.count}`}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--sub)]">
            {stat ? 'No recorded confusions for this key.' : 'No data for this key yet.'}
          </p>
        )}
      </div>

      <Button variant="primary" size="md" onClick={() => onPractice(def.code)}>
        Practice this key
      </Button>
    </div>
  );
}

function InspectorStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'error';
}) {
  const valueClass =
    tone === 'error' ? 'text-[var(--error)]' : 'text-[var(--text)]';
  return (
    <div className="rounded-md border border-[var(--sub-2)] bg-[var(--bg-elev)] px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--sub)]">{label}</div>
      <div className={`text-sm font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}
