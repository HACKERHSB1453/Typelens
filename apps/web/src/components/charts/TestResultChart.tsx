import { useMemo, useRef, useState } from 'react';
import { Chart } from 'react-chartjs-2';
import type { Chart as ChartJS, ChartData, ChartOptions, Plugin } from 'chart.js';
import { speedAt } from '@typelens/core';
import type { InputEvent, SpeedPoint, TestChart } from '@/data/types';
import { CHART_COLORS, gridStyle, tickStyle } from './chartTheme';

type Point = { x: number; y: number | null };

interface Hover {
  /** pixel x of the hovered moment inside the canvas */
  px: number;
  /** canvas width, to flip the readout near the right edge */
  width: number;
  point: SpeedPoint;
}

/**
 * Monkeytype's result-screen graph (wpm so far, raw speed per second, errors), rebuilt from the recorded
 * keystrokes. Monkeytype shows this once and discards it; here it is kept for every test.
 *
 * With `words` + `inputEvents`, hovering shows the numbers at ANY moment (not only at whole seconds): a
 * vertical line follows the pointer and a readout shows the time, wpm so far, raw speed and errors so far.
 */
export function TestResultChart({
  chart,
  words,
  inputEvents,
  height = 240,
  pbWpm,
}: {
  chart: TestChart;
  words?: readonly string[];
  inputEvents?: readonly InputEvent[];
  height?: number;
  pbWpm?: number;
}) {
  const hoverAnywhere = !!words && !!inputEvents;
  const [hover, setHover] = useState<Hover | null>(null);
  const hoverRef = useRef<Hover | null>(null);
  const sourceRef = useRef({ words, inputEvents });
  sourceRef.current = { words, inputEvents };

  const plugins = useMemo<Plugin<'line'>[]>(
    () => [
      {
        id: 'hoverAnywhere',
        afterEvent(c: ChartJS, args) {
          const { words: w, inputEvents: ev } = sourceRef.current;
          if (!w || !ev) return;
          const e = args.event;
          const clear = () => {
            if (!hoverRef.current) return;
            hoverRef.current = null;
            setHover(null);
            args.changed = true;
          };
          if (e.type === 'mouseout' || !args.inChartArea || e.x === null) return clear();
          // Chart.js reports touch drags as mousemove and taps as click
          if (e.type !== 'mousemove' && e.type !== 'click') return;
          const x = c.scales.x;
          if (!x) return;
          const sec = Math.min(x.max, Math.max(x.min, x.getValueForPixel(e.x) ?? x.min));
          const next: Hover = { px: x.getPixelForValue(sec), width: c.width, point: speedAt(w, ev, sec * 1000) };
          hoverRef.current = next;
          setHover(next);
          args.changed = true;
        },
        afterDatasetsDraw(c: ChartJS) {
          const h = hoverRef.current;
          const y = c.scales.y;
          if (!h || !y) return;
          const { top, bottom } = c.chartArea;
          const ctx = c.ctx;
          ctx.save();
          ctx.strokeStyle = CHART_COLORS.sub;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(h.px, top);
          ctx.lineTo(h.px, bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          const dot = (value: number, color: string) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(h.px, y.getPixelForValue(value), 3.5, 0, Math.PI * 2);
            ctx.fill();
          };
          dot(h.point.raw, CHART_COLORS.sub);
          dot(h.point.wpm, CHART_COLORS.main);
          ctx.restore();
        },
      },
    ],
    [],
  );

  const xy = (values: Array<number | null>): Point[] => chart.seconds.map((s, i) => ({ x: s, y: values[i] ?? null }));
  const data: ChartData<'line' | 'scatter', Point[]> = {
    datasets: [
      {
        type: 'line',
        label: 'wpm',
        data: xy(chart.wpm),
        borderColor: CHART_COLORS.main,
        backgroundColor: CHART_COLORS.main,
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.25,
        yAxisID: 'y',
        order: 1,
      },
      {
        type: 'line',
        label: 'raw',
        data: xy(chart.raw),
        borderColor: CHART_COLORS.sub,
        backgroundColor: CHART_COLORS.sub,
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        tension: 0.25,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'scatter',
        label: 'errors',
        data: xy(chart.errors.map((e) => (e > 0 ? e : null))),
        borderColor: CHART_COLORS.error,
        backgroundColor: CHART_COLORS.error,
        pointStyle: 'crossRot',
        pointRadius: 4,
        pointBorderWidth: 2,
        yAxisID: 'errors',
        order: 0,
      },
    ],
  };
  const maxErr = Math.max(1, ...chart.errors);
  const options: ChartOptions<'line' | 'scatter'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: CHART_COLORS.sub, boxWidth: 12, boxHeight: 12, padding: 12 } },
      tooltip: {
        // the hover-anywhere readout replaces the per-second tooltip
        enabled: !hoverAnywhere,
        backgroundColor: CHART_COLORS.bg,
        borderColor: CHART_COLORS.grid,
        borderWidth: 1,
        titleColor: CHART_COLORS.text,
        bodyColor: CHART_COLORS.text,
        callbacks: { title: (items) => `${items[0]?.parsed.x ?? ''} s` },
      },
    },
    scales: {
      x: {
        type: 'linear',
        min: chart.seconds[0],
        max: chart.seconds[chart.seconds.length - 1],
        grid: gridStyle,
        ticks: { ...tickStyle, callback: (v) => String(Math.round(Number(v) * 10) / 10) },
        border: { display: false },
        title: { display: true, text: 'seconds', color: CHART_COLORS.sub },
      },
      y: {
        position: 'left',
        min: 0,
        suggestedMax: pbWpm,
        grid: gridStyle,
        ticks: tickStyle,
        border: { display: false },
        title: { display: true, text: 'words per minute', color: CHART_COLORS.sub },
      },
      errors: {
        position: 'right',
        min: 0,
        max: maxErr + 1,
        grid: { display: false },
        ticks: { ...tickStyle, stepSize: 1, precision: 0 },
        border: { display: false },
        title: { display: true, text: 'errors', color: CHART_COLORS.sub },
      },
    },
  };
  const flip = hover ? hover.px > hover.width * 0.7 : false;
  return (
    <div style={{ height }} className="relative w-full">
      <Chart
        type="line"
        data={data as unknown as ChartData<'line'>}
        options={options as ChartOptions<'line'>}
        plugins={hoverAnywhere ? plugins : []}
      />
      {hover && (
        <div
          className="pointer-events-none absolute top-8 z-10 whitespace-nowrap rounded border border-[var(--sub-2)] bg-[var(--bg-dark)] px-2.5 py-1.5 text-xs text-[var(--text)]"
          style={flip ? { right: hover.width - hover.px + 10 } : { left: hover.px + 10 }}
          role="status"
          aria-live="polite"
        >
          <div className="mb-0.5 font-bold">{(hover.point.t / 1000).toFixed(2)} s</div>
          <div>wpm {hover.point.wpm.toFixed(1)}</div>
          <div className="text-[var(--sub)]">raw {hover.point.raw.toFixed(1)}</div>
          <div className={hover.point.errors > 0 ? 'text-[var(--error)]' : 'text-[var(--sub)]'}>errors so far {hover.point.errors}</div>
        </div>
      )}
    </div>
  );
}
