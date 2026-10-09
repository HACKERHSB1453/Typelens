/** Small numeric helpers. Pure. Empty input yields 0 — never NaN or Infinity. */

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function median(xs: readonly number[]): number {
  return percentile(xs, 50);
}

/** Linear interpolation between closest ranks; p in 0..100. */
export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (a.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const l = a[lo] as number;
  const h = a[hi] as number;
  return l + (h - l) * (rank - lo);
}

/** Population standard deviation. */
export function stdDev(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / xs.length);
}

/** Monkeytype's consistency transform: maps a coefficient of variation to 0..100 (lower variation => higher). */
export function kogasa(cov: number): number {
  return 100 * (1 - Math.tanh(cov + Math.pow(cov, 3) / 3 + Math.pow(cov, 5) / 5));
}

/**
 * Fixed-width histogram over [0, maxMs). Values >= maxMs land in the last bin, negatives in the first.
 * counts.length === ceil(maxMs / binMs).
 */
export function histogram(values: readonly number[], binMs: number, maxMs: number): { binMs: number; counts: number[] } {
  const n = Math.max(1, Math.ceil(maxMs / binMs));
  const counts = new Array<number>(n).fill(0);
  for (const v of values) {
    const i = Math.min(n - 1, Math.max(0, Math.floor(v / binMs)));
    counts[i] = (counts[i] as number) + 1;
  }
  return { binMs, counts };
}

/** Deterministic PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function round(x: number, digits = 1): number {
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}
