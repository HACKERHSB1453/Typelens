import { Line } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import './chartTheme';
import { CHART_COLORS, gridStyle, tickStyle } from './chartTheme';

export interface LineSeries {
  label: string;
  data: number[];
  color?: string;
  fill?: boolean;
  dashed?: boolean;
}

/** Themed line chart wrapper used for trends. */
export function LineChart({
  labels,
  series,
  height = 220,
  yLabel,
  yMax,
  yMin = 0,
  showLegend = true,
  formatY,
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  yLabel?: string;
  yMax?: number;
  yMin?: number;
  showLegend?: boolean;
  formatY?: (v: number) => string;
}) {
  const data: ChartData<'line'> = {
    labels,
    datasets: series.map((s) => ({
      label: s.label,
      data: s.data,
      borderColor: s.color ?? CHART_COLORS.main,
      backgroundColor: s.color ?? CHART_COLORS.main,
      fill: s.fill ?? false,
      tension: 0.3,
      borderWidth: 2,
      pointRadius: labels.length > 40 ? 0 : 2,
      pointHoverRadius: 4,
      borderDash: s.dashed ? [4, 4] : undefined,
      pointBackgroundColor: s.color ?? CHART_COLORS.main,
    })),
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: showLegend,
        labels: { color: CHART_COLORS.sub, boxWidth: 12, boxHeight: 12, padding: 12 },
      },
      tooltip: {
        backgroundColor: CHART_COLORS.bg,
        borderColor: CHART_COLORS.grid,
        borderWidth: 1,
        titleColor: CHART_COLORS.text,
        bodyColor: CHART_COLORS.text,
        padding: 8,
      },
    },
    scales: {
      // long ranges have a label per day: show at most ~10, never rotated
      x: { grid: { ...gridStyle, display: false }, ticks: { ...tickStyle, autoSkip: true, maxTicksLimit: 10, maxRotation: 0 }, border: { display: false } },
      y: {
        grid: gridStyle,
        ticks: formatY ? { ...tickStyle, callback: (v) => formatY(Number(v)) } : tickStyle,
        border: { display: false },
        title: yLabel ? { display: true, text: yLabel, color: CHART_COLORS.sub } : undefined,
        max: yMax,
        min: yMin,
      },
    },
  };

  return (
    <div style={{ height }} className="w-full">
      <Line data={data} options={options} />
    </div>
  );
}
