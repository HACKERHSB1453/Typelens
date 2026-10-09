import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Generic sortable, scrollable data table. */
export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => number | string;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

export function SortableTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyHint,
  maxRowsVisible,
  initialSort,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyHint?: string;
  maxRowsVisible?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
}) {
  const [sortKey, setSortKey] = useState<string | null>(initialSort?.key ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSort?.dir ?? 'desc');

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sortKey, sortDir, columns]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const alignClass = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--sub-2)]">
      {/* height fits exactly maxRowsVisible rows (header ~2.5rem, each row ~2.4rem) instead of a fixed cap */}
      <div className="overflow-auto" style={maxRowsVisible ? { maxHeight: `calc(2.5rem + ${maxRowsVisible} * 2.4rem)` } : undefined}>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--bg-dark)]">
            <tr>
              {columns.map((c) => {
                const active = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    className={cn(
                      'border-b border-[var(--sub-2)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--sub)]',
                      alignClass(c.align),
                      c.sortValue ? 'cursor-pointer select-none hover:text-[var(--text)]' : '',
                      c.className,
                    )}
                    onClick={c.sortValue ? () => toggleSort(c.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.header}
                      {c.sortValue &&
                        (active ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="h-3 w-3 text-[var(--main)]" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-[var(--main)]" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        ))}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-6 text-center text-xs text-[var(--sub)]"
                >
                  {emptyHint ?? 'No rows.'}
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-sub-2/60 last:border-0 transition',
                    onRowClick ? 'cursor-pointer hover:bg-[var(--bg-elev)]' : '',
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-3 py-2 text-[var(--text)]', alignClass(c.align), c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
