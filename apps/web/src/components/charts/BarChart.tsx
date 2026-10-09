import { Bar } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import './chartTheme';
import { CHART_COLORS, gridStyle, tickStyle } from './chartTheme';

export interface BarSeries {
  label: string;
  data: number[];
  color?: string;
}

/** Themed bar chart wrapper. */
export function BarChart({
  labels,
  series,
  height = 220,
  horizontal = false,
  formatValue,
  showLegend = false,
  stacked = false,
}: {
  labels: string[];
  series: BarSeries[];
  height?: number;
  horizontal?: boolean;
  formatValue?: (v: number) => string;
  showLegend?: boolean;
  stacked?: boolean;
}) {
  const data: ChartData<'bar'> = {
    labels,
    datasets: series.map((s) => ({
      label: s.label,
      data: s.data,
      backgroundColor: s.color ?? CHART_COLORS.main,
      borderColor: s.color ?? CHART_COLORS.main,
      borderWidth: 0,
      borderRadius: 3,
    })),
  };

  const options: ChartOptions<'bar'> = {
    indexAxis: horizontal ? ('y' as const) : ('x' as const),
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: showLegend,
        labels: { color: CHART_COLORS.sub, boxWidth: 12, padding: 12 },
      },
      tooltip: {
        backgroundColor: CHART_COLORS.bg,
        borderColor: CHART_COLORS.grid,
        borderWidth: 1,
        titleColor: CHART_COLORS.text,
        bodyColor: CHART_COLORS.text,
        padding: 8,
        callbacks: formatValue
          ? { label: (ctx) => `${ctx.dataset.label}: ${formatValue(Number(ctx.parsed.y ?? ctx.parsed.x))}` }
          : undefined,
      },
    },
    scales: {
      x: {
        grid: horizontal ? gridStyle : { display: false },
        // only set a callback when there is one: an explicit undefined replaces Chart.js's default and a
        // category axis then shows indices (0, 1, 2) instead of its labels
        ticks: horizontal && formatValue ? { ...tickStyle, callback: (v) => formatValue(Number(v)) } : tickStyle,
        stacked,
        border: { display: false },
      },
      y: {
        grid: horizontal ? { display: false } : gridStyle,
        ticks: !horizontal && formatValue ? { ...tickStyle, callback: (v) => formatValue(Number(v)) } : tickStyle,
        stacked,
        border: { display: false },
      },
    },
  };

  return (
    <div style={{ height }} className="w-full">
      <Bar data={data} options={options} />
    </div>
  );
}
