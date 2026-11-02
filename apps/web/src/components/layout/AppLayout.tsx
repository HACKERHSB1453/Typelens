import { Suspense, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { FilterBar } from './FilterBar';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useSourceInfo } from '@/data';
import { getHost, useExtensionStatus, useHostNavigation } from '@/host';
import { UpdateBanner } from '@/components/host/UpdateBanner';
import { receiveMonkeytypeTheme, useThemeVersion } from '@/lib/themeStore';

/** Passes the Monkeytype theme the extension reports to the theme store (it applies it in "monkeytype" mode). */
function MonkeytypeThemeSync() {
  const { status } = useExtensionStatus();
  const theme = status?.monkeytypeTheme ?? null;
  useEffect(() => receiveMonkeytypeTheme(theme), [theme]);
  return null;
}

/** Shown while there are no real sessions (or when the user chose the demo): says so, and where to go next. */
function DemoBanner() {
  const { effective, pref, realCount, setPref } = useSourceInfo();
  if (effective !== 'demo') return null;
  const none = realCount === 0 || realCount === null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sub-2)] bg-[var(--bg-elev)] px-4 py-2 text-xs md:px-6">
      <span>
        <strong className="text-[var(--main)]">You are looking at demo data.</strong>{' '}
        {none
          ? 'These numbers are made up, so you can see what TypeLens shows. Set it up to see your own typing.'
          : `You have ${realCount} real test${realCount === 1 ? '' : 's'}, but demo data is switched on.`}
      </span>
      <span className="flex items-center gap-3">
        {pref === 'demo' ? (
          <button className="rounded-md bg-[var(--main)] px-2.5 py-1 font-semibold text-[var(--bg)] hover:brightness-110" onClick={() => setPref('auto')}>
            Show my data
          </button>
        ) : (
          none && (
            <Link className="rounded-md bg-[var(--main)] px-2.5 py-1 font-semibold text-[var(--bg)] hover:brightness-110" to="/setup">
              Set up TypeLens →
            </Link>
          )
        )}
      </span>
    </div>
  );
}

/**
 * App shell: left sidebar + a column with the sticky filter bar, the routed
 * page, and a footer that sticks to the bottom on short pages and is pushed
 * down naturally on long pages (flex-col + min-h-screen + main flex-1).
 */
export function AppLayout() {
  // the filter bar only changes the analysis pages
  const { pathname } = useLocation();
  const showFilters = !['/setup', '/settings', '/data'].includes(pathname);
  useHostNavigation(); // desktop menu: Ctrl/Cmd+1..9 switch pages, File > Import / Export
  const local = getHost().kind === 'desktop' ? 'this computer' : 'this browser';
  const themeVersion = useThemeVersion(); // canvas charts keep their colours: remount pages on a theme change
  return (
    <div className="flex min-h-screen">
      <MonkeytypeThemeSync />
      <CommandPalette />
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <UpdateBanner />
        {showFilters && <FilterBar />}
        {pathname !== '/setup' && <DemoBanner />}
        <main className="flex-1 p-4 md:p-6">
          <ErrorBoundary label="page" key={themeVersion}>
            {/* pages are lazy-loaded chunks: without this boundary, opening a not-yet-loaded page crashes */}
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center p-12">
                  <Spinner size="lg" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
        <footer className="mt-auto border-t border-[var(--sub-2)] bg-[var(--bg-dark)] px-4 py-3 text-[10px] text-[var(--sub)] md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              TypeLens — local-first typing analytics for Monkeytype. Your data never leaves {local}.
            </span>
            <span className="opacity-70">Not affiliated with Monkeytype.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
