/** Restoring the window where the user left it, without ever opening it off-screen (monitor unplugged, resolution change). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Bounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

const MIN_VISIBLE = 120;

/**
 * Returns the saved bounds when enough of the window is on some display, with the size capped to that display.
 * Otherwise only the size is kept and `x`/`y` are left out, so the OS centres the window on the primary display.
 */
export function clampBounds(saved: Bounds, workAreas: Rect[], fallback: Rect = { x: 0, y: 0, width: 1920, height: 1080 }): Bounds {
  const areas = workAreas.length ? workAreas : [fallback];
  const biggest = areas.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  const sizeOnly = (): Bounds => ({ width: Math.min(saved.width, biggest.width), height: Math.min(saved.height, biggest.height) });
  if (saved.x === undefined || saved.y === undefined) return sizeOnly();
  const { x, y } = saved;
  const visible = areas.find((a) => {
    const w = Math.min(x + saved.width, a.x + a.width) - Math.max(x, a.x);
    const h = Math.min(y + saved.height, a.y + a.height) - Math.max(y, a.y);
    return w >= MIN_VISIBLE && h >= MIN_VISIBLE;
  });
  if (!visible) return sizeOnly();
  const width = Math.min(saved.width, visible.width);
  const height = Math.min(saved.height, visible.height);
  return {
    width,
    height,
    x: Math.max(visible.x, Math.min(x, visible.x + visible.width - width)),
    y: Math.max(visible.y, Math.min(y, visible.y + visible.height - height)),
  };
}
