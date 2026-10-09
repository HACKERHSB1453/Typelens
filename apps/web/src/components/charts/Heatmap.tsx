// GitHub-style 12-month activity heatmap. Columns = weeks (oldest left → newest
// right), rows = Sun..Sat. Cells are tinted by session count using the --main
// token at increasing opacities.

const WEEKS = 53; // ~52-53 weeks visible (last column = current week)
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Only label Mon/Wed/Fri rows to keep the gutter narrow (GitHub convention).
const WEEKDAY_LABELS: string[] = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

interface Day {
  date: Date;
  key: string; // YYYY-MM-DD (local)
  count: number;
  future: boolean;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function colorFor(n: number): string {
  if (n <= 0) return 'var(--bg-elev)';
  if (n === 1) return 'rgb(var(--main-rgb) / 0.25)';
  if (n === 2) return 'rgb(var(--main-rgb) / 0.45)';
  if (n === 3) return 'rgb(var(--main-rgb) / 0.65)';
  return 'rgb(var(--main-rgb) / 1)';
}

export function Heatmap({ counts }: { counts: Record<string, number> }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Sunday of the current week (start of the rightmost column).
  const startOfThisWeek = new Date(today);
  startOfThisWeek.setDate(today.getDate() - today.getDay());

  // Build WEEKS columns, oldest left → newest right.
  const columns: Day[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const weekStart = new Date(startOfThisWeek);
    weekStart.setDate(weekStart.getDate() - (WEEKS - 1 - w) * 7);
    const col: Day[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const key = dateKey(d);
      col.push({ date: d, key, count: counts[key] ?? 0, future: d > today });
    }
    columns.push(col);
  }

  const cellBase = 'h-3 w-3 rounded-[2px]';
  const gutterX = 'mr-[2px]';
  const gutterY = 'mb-[2px]';

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-block min-w-max">
        {/* Month labels — one slot per column, labelled when the month changes. */}
        <div className="mb-1 flex">
          <div className={`w-7 ${gutterX}`} />
          {columns.map((col, i) => {
            const m = col[0].date.getMonth();
            const prev = i > 0 ? columns[i - 1][0].date.getMonth() : -1;
            const show = i === 0 || m !== prev;
            return (
              <div
                key={i}
                className={`w-3 ${gutterX} text-[9px] leading-3 text-[var(--sub)]`}
              >
                {show ? MONTH_SHORT[m] : ''}
              </div>
            );
          })}
        </div>

        {/* Body: weekday labels + week columns. */}
        <div className="flex">
          <div className={`w-7 ${gutterX}`}>
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={i}
                className={`h-3 ${gutterY} text-[9px] leading-3 text-[var(--sub)]`}
              >
                {label}
              </div>
            ))}
          </div>
          <div className="flex">
            {columns.map((col, i) => (
              <div key={i} className={`flex flex-col ${gutterX}`}>
                {col.map((day) => (
                  <div
                    key={day.key}
                    className={`${cellBase} ${gutterY}`}
                    style={{
                      backgroundColor: day.future ? 'transparent' : colorFor(day.count),
                    }}
                    title={`${day.key}: ${day.count} session${day.count === 1 ? '' : 's'}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-2 flex items-center justify-end gap-1 text-[9px] text-[var(--sub)]">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-3 w-3 rounded-[2px]"
              style={{ backgroundColor: colorFor(n) }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
