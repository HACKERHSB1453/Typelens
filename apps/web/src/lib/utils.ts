// Small, dependency-free helpers shared across the app.
// (No clsx/tailwind-merge — we keep the dependency surface minimal.)

/** Compose Tailwind class strings; later values win on conflict by simple dedupe-ish join. */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(' ');
}

/* ----------------------------------------------------------------------------
 * Small stats helpers used across the analysis & UI layers.
 * ------------------------------------------------------------------------- */

/** Median of an array of numbers (0 for empty arrays). */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Arithmetic mean (0 for empty arrays). */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Standard deviation (population, 0 for empty arrays). */
export function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

/** Round to N decimals. */
export function round(v: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** Clamp a value into [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/* ----------------------------------------------------------------------------
 * Formatting helpers.
 * ------------------------------------------------------------------------- */

export function formatNumber(v: number, decimals = 0): string {
  return round(v, decimals).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatMs(v: number): string {
  if (!isFinite(v)) return '—';
  return `${round(v, 0)}ms`;
}

export function formatPercent(v: number, decimals = 1): string {
  return `${formatNumber(v, decimals)}%`;
}

/** "1.2k" style compact formatting. */
export function formatCompact(v: number): string {
  if (v >= 1_000_000) return `${round(v / 1_000_000, 1)}M`;
  if (v >= 1_000) return `${round(v / 1_000, 1)}k`;
  return `${round(v, 0)}`;
}

/** Format a date as YYYY-MM-DD using the local timezone. */
export function formatDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format a date as e.g. "Sep 20, 14:30". */
export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
}

/** Human-readable duration, e.g. "1m 23s" or "45s". */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return `${m}m ${r}s`;
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Promise-based delay. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Download a Blob in the browser. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** "just now", "3 min ago", "2 h ago", "5 days ago". */
export function timeAgo(ts: number, now: number = Date.now()): string {
  const sec = Math.max(0, Math.round((now - ts) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** "2026-10-05" (a local calendar day) -> "Oct 5" */
export function formatDayLabel(isoDay: string): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  if (!y || !m || !d) return isoDay;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
