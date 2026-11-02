import { NavLink } from 'react-router-dom';
import { useSourceInfo } from '@/data';
import {
  Activity,
  Keyboard,
  Type,
  AlignLeft,
  Hand,
  Play,
  TrendingUp,
  Target,
  Database,
  Settings,
  Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SETTINGS_PATH } from '@typelens/host-contract';
import { useAppInfo } from '@/host/hooks';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Activity;
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Analyse',
    items: [
      { to: '/', label: 'Overview', icon: Activity },
      { to: '/keys', label: 'Keys', icon: Keyboard },
      { to: '/ngrams', label: 'N-grams', icon: Type },
      { to: '/words', label: 'Words', icon: AlignLeft },
      { to: '/fingers', label: 'Fingers', icon: Hand },
    ],
  },
  {
    label: 'Review',
    items: [
      { to: '/replay', label: 'Replay', icon: Play },
      { to: '/progress', label: 'Progress', icon: TrendingUp },
    ],
  },
  {
    label: 'Train',
    items: [{ to: '/practice', label: 'Practice', icon: Target }],
  },
  {
    label: 'Manage',
    items: [{ to: '/data', label: 'Data', icon: Database }],
  },
];

/** The TypeLens lens (the same shape as the app and extension icons), drawn in the theme's colours. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="0.5" y="0.5" width="31" height="31" rx="6.4" fill="var(--bg-dark)" stroke="var(--sub-2)" />
      <circle cx="13.44" cy="13.44" r="7.68" fill="none" stroke="var(--main)" strokeWidth="4.48" />
      <line x1="19.2" y1="19.2" x2="26.88" y2="26.88" stroke="var(--main)" strokeWidth="4.48" strokeLinecap="round" />
    </svg>
  );
}

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  cn(
    'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors md:mx-2 md:px-3',
    isActive
      ? 'bg-[var(--bg-elev)] font-semibold text-[var(--main)] before:absolute before:-left-2 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-[var(--main)]'
      : 'text-[var(--sub)] hover:bg-[var(--bg-elev)] hover:text-[var(--text)]',
  );

export function Sidebar() {
  const src = useSourceInfo();
  const info = useAppInfo();
  const demo = src.effective === 'demo';
  return (
    <aside
      aria-label="Primary navigation"
      className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-[var(--sub-2)] bg-[var(--bg-dark)] md:w-56"
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-[var(--sub-2)] px-4">
        <LogoMark className="h-7 w-7 shrink-0" />
        <span className="hidden flex-col leading-tight md:flex">
          <span className="text-sm font-bold tracking-wide text-[var(--text)]">TypeLens</span>
          <span className="text-[10px] text-[var(--sub)]">typing analytics</span>
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {/* until the first real test arrives, the most useful page is the setup guide */}
        {(src.realCount ?? 0) === 0 && (
          <div className="mb-3">
            <NavLink
              to="/setup"
              title="Get started"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md border px-3 py-2 text-sm font-semibold transition-colors md:mx-2',
                  isActive ? 'border-[var(--main)] bg-main/10 text-[var(--main)]' : 'border-[var(--sub-2)] text-[var(--text)] hover:border-[var(--main)]',
                )
              }
            >
              <Rocket className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden md:inline">Get started</span>
            </NavLink>
          </div>
        )}
        {NAV_GROUPS.map((g) => (
          <div key={g.label} className="mb-3">
            <div className="hidden px-5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--sub)] opacity-70 md:block">{g.label}</div>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink to={item.to} end={item.to === '/'} className={linkClass} title={item.label}>
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="hidden md:inline">{item.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-[var(--sub-2)] py-2">
        <NavLink to={SETTINGS_PATH} className={linkClass} title="Settings">
          <Settings className="h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden md:inline">Settings</span>
        </NavLink>
      </div>
      <div className="hidden items-center justify-between gap-2 border-t border-[var(--sub-2)] px-4 py-3 text-[10px] text-[var(--sub)] md:flex">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', demo ? 'bg-[var(--sub)]' : 'bg-[var(--main)]')} aria-hidden />
          <span className="truncate">{demo ? 'Demo data' : `${src.realCount ?? 0} tests`}</span>
        </span>
        {info && <span className="shrink-0 tnum opacity-70">v{info.version}</span>}
      </div>
    </aside>
  );
}
