import { Chart } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import type { TestChart } from '@/data/types';
import { CHART_COLORS, gridStyle, tickStyle } from './chartTheme';

/**
 * Monkeytype's result-screen graph (wpm so far, raw speed per second, errors), rebuilt from the recorded
 * keystrokes. Monkeytype shows this once and discards it; here it is kept for every test.
 */
export function TestResultChart({ chart, height = 240, pbWpm }: { chart: TestChart; height?: number; pbWpm?: number }) {
  const labels = chart.seconds.map((s) => (Number.isInteger(s) ? String(s) : s.toFixed(1)));
  const data: ChartData<'line' | 'scatter', Array<number | null>> = {
    labels,
    datasets: [
      {
        type: 'line',
        label: 'wpm',
        data: chart.wpm,
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
        data: chart.raw,
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
        data: chart.errors.map((e) => (e > 0 ? e : null)),
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
        backgroundColor: CHART_COLORS.bg,
        borderColor: CHART_COLORS.grid,
        borderWidth: 1,
        titleColor: CHART_COLORS.text,
        bodyColor: CHART_COLORS.text,
        callbacks: { title: (items) => `${items[0]?.label ?? ''} s` },
      },
    },
    scales: {
      x: { grid: gridStyle, ticks: tickStyle, border: { display: false }, title: { display: true, text: 'seconds', color: CHART_COLORS.sub } },
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
  return (
    <div style={{ height }} className="w-full">
      <Chart type="line" data={data as ChartData<'line'>} options={options as ChartOptions<'line'>} />
    </div>
  );
}
