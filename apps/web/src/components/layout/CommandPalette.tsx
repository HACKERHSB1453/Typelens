import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlignLeft,
  CalendarRange,
  CornerDownLeft,
  Database,
  Download,
  FlaskConical,
  Hand,
  Keyboard,
  Palette,
  Play,
  Search,
  Settings,
  Target,
  TrendingUp,
  Type,
  Upload,
  User,
} from 'lucide-react';
import { useFilters, type RangePreset } from '@/hooks/useFilters';
import { useSourceInfo } from '@/data';
import { THEME_PRESETS } from '@/lib/themes';
import { updateThemeSettings } from '@/lib/themeStore';
import { cn } from '@/lib/utils';

const OPEN_EVENT = 'typelens:command-palette';

/** Opens the palette from anywhere (the filter bar's Search button). */
export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  icon: ComponentType<{ className?: string }>;
  run: () => void;
}

/** Ranks a command for the query: every word must appear; earlier and label matches rank higher. */
export function scoreCommand(c: Pick<Command, 'label' | 'group' | 'keywords'>, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const label = c.label.toLowerCase();
  const hay = `${label} ${c.group.toLowerCase()} ${c.keywords ?? ''}`.toLowerCase();
  let score = 0;
  for (const w of q.split(/\s+/)) {
    const i = hay.indexOf(w);
    if (i < 0) return 0;
    score += label.startsWith(w) ? 4 : label.includes(w) ? 2 : 1;
  }
  return score;
}

/**
 * Ctrl/Cmd+K: a searchable list of everything the app can do. Arrow keys move, Enter runs, Escape closes.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const f = useFilters();
  const src = useSourceInfo();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = (): void => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // cleared when it closes (not when it opens: that would wipe keys typed right after Ctrl/Cmd+K)
  useEffect(() => {
    if (open) return;
    setQuery('');
    setActive(0);
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => navigate(to);
    const range = (r: RangePreset) => () => f.setRangePreset(r);
    const menu = (menuAction: 'import' | 'export-json') => () => navigate('/data', { state: { menuAction, nonce: Date.now() } });
    return [
      { id: 'p-overview', group: 'Go to', label: 'Overview', icon: Activity, run: go('/'), keywords: 'home dashboard kpi' },
      { id: 'p-keys', group: 'Go to', label: 'Keys', icon: Keyboard, run: go('/keys'), keywords: 'heatmap keyboard' },
      { id: 'p-ngrams', group: 'Go to', label: 'N-grams', icon: Type, run: go('/ngrams'), keywords: 'bigrams trigrams' },
      { id: 'p-words', group: 'Go to', label: 'Words', icon: AlignLeft, run: go('/words') },
      { id: 'p-fingers', group: 'Go to', label: 'Fingers & hands', icon: Hand, run: go('/fingers') },
      { id: 'p-replay', group: 'Go to', label: 'Replay', icon: Play, run: go('/replay'), keywords: 'history tests sessions' },
      { id: 'p-progress', group: 'Go to', label: 'Progress', icon: TrendingUp, run: go('/progress'), keywords: 'trend improvement streak' },
      { id: 'p-practice', group: 'Go to', label: 'Practice', icon: Target, run: go('/practice'), keywords: 'drill train generate' },
      { id: 'p-data', group: 'Go to', label: 'Data', icon: Database, run: go('/data'), keywords: 'extension sync' },
      { id: 'p-settings', group: 'Go to', label: 'Settings', icon: Settings, run: go('/settings'), keywords: 'preferences options' },
      { id: 'p-goals', group: 'Go to', label: 'Edit goals', icon: Target, run: go('/settings#goals'), keywords: 'target weekly minutes wpm' },
      { id: 'r-7', group: 'Date range', label: 'Last 7 days', icon: CalendarRange, run: range('7d'), keywords: 'week range filter' },
      { id: 'r-30', group: 'Date range', label: 'Last 30 days', icon: CalendarRange, run: range('30d'), keywords: 'month range filter' },
      { id: 'r-90', group: 'Date range', label: 'Last 90 days', icon: CalendarRange, run: range('90d'), keywords: 'quarter range filter' },
      { id: 'r-all', group: 'Date range', label: 'All time', icon: CalendarRange, run: range('all'), keywords: 'range filter everything' },
      { id: 'a-import', group: 'Actions', label: 'Import JSON or Monkeytype CSV', icon: Upload, run: menu('import'), keywords: 'load restore' },
      { id: 'a-export', group: 'Actions', label: 'Export all data as JSON', icon: Download, run: menu('export-json'), keywords: 'backup save download' },
      src.pref === 'demo'
        ? { id: 'a-mine', group: 'Actions', label: 'Show my data', icon: User, run: () => src.setPref('auto'), keywords: 'real demo' }
        : { id: 'a-demo', group: 'Actions', label: 'Show demo data', icon: FlaskConical, run: () => src.setPref('demo'), keywords: 'example sample' },
      ...THEME_PRESETS.map((t) => ({
        id: `t-${t.id}`,
        group: 'Theme',
        label: t.name,
        icon: Palette,
        keywords: 'theme colours colors appearance',
        run: () => updateThemeSettings({ mode: 'preset', preset: t.id }),
      })),
    ];
  }, [navigate, f, src]);

  const results = useMemo(
    () =>
      commands
        .map((c, i) => ({ c, s: scoreCommand(c, query), i }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .map((r) => r.c),
    [commands, query],
  );

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (c: Command | undefined): void => {
    if (!c) return;
    setOpen(false);
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  let lastGroup = '';
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--sub-2)] bg-[var(--bg-dark)] shadow-2xl shadow-black/60">
        <div className="flex items-center gap-2 border-b border-[var(--sub-2)] px-4">
          <Search className="h-4 w-4 shrink-0 text-[var(--sub)]" aria-hidden />
          <input
            ref={input}
            // focused on mount, so keys typed right after Ctrl/Cmd+K land here
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, actions and themes…"
            className="h-12 w-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--sub)] focus-visible:!outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
          />
          <kbd className="rounded border border-[var(--sub-2)] px-1.5 text-[10px] text-[var(--sub)]">Esc</kbd>
        </div>
        <ul id="command-list" ref={list} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-xs text-[var(--sub)]">Nothing matches “{query}”.</li>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            const Icon = c.icon;
            return (
              <li key={c.id} role="none">
                {header && <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--sub)]">{header}</div>}
                <button
                  id={`cmd-${c.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(c)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm',
                    i === active ? 'bg-[var(--bg-elev)] text-[var(--text)]' : 'text-[var(--sub)]',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{c.label}</span>
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-[var(--sub)]" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-4 border-t border-[var(--sub-2)] px-4 py-2 text-[10px] text-[var(--sub)]">
          <span>↑↓ move</span>
          <span>↵ run</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
