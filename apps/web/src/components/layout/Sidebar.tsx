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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SETTINGS_PATH } from '@typelens/host-contract';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Activity;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: Activity },
  { to: '/keys', label: 'Keys', icon: Keyboard },
  { to: '/ngrams', label: 'N-grams', icon: Type },
  { to: '/words', label: 'Words', icon: AlignLeft },
  { to: '/fingers', label: 'Fingers', icon: Hand },
  { to: '/replay', label: 'Replay', icon: Play },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  { to: '/practice', label: 'Practice', icon: Target },
  { to: '/data', label: 'Data', icon: Database },
];

export function Sidebar() {
  const src = useSourceInfo();
  return (
    <aside
      aria-label="Primary navigation"
      className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-[var(--sub-2)] bg-[var(--bg-dark)] md:w-56"
    >
      <div className="flex h-14 items-center gap-2 border-b border-[var(--sub-2)] px-3 md:px-4">
        <span
          className="grid h-7 w-7 place-items-center rounded-md bg-[var(--main)] text-[var(--bg)] font-bold"
          aria-hidden
        >
          T
        </span>
        <span className="hidden text-sm font-semibold tracking-wide text-[var(--text)] md:inline">
          TypeLens
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition md:px-4',
                      isActive
                        ? 'bg-main/10 text-[var(--main)] font-semibold'
                        : 'text-[var(--sub)] hover:bg-[var(--bg-elev)] hover:text-[var(--text)]',
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="hidden md:inline">{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-[var(--sub-2)] py-2">
        <NavLink
          to={SETTINGS_PATH}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition md:px-4',
              isActive
                ? 'bg-main/10 text-[var(--main)] font-semibold'
                : 'text-[var(--sub)] hover:bg-[var(--bg-elev)] hover:text-[var(--text)]',
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden md:inline">Settings</span>
        </NavLink>
      </div>
      <div className="hidden border-t border-[var(--sub-2)] px-4 py-3 text-[10px] text-[var(--sub)] md:block">
        {src.effective === 'demo' ? 'Showing demo data' : `Your data · ${src.realCount ?? 0} tests`}
      </div>
    </aside>
  );
}
