import { Suspense } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { Sidebar } from './Sidebar';
import { FilterBar } from './FilterBar';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useSourceInfo } from '@/data';
import { getHost, useHostNavigation } from '@/host';
import { UpdateBanner } from '@/components/host/UpdateBanner';

/** Shown while there are no real sessions (or when the user chose the demo): says so, and how to fix it. */
function DemoBanner() {
  const { effective, pref, realCount, setPref } = useSourceInfo();
  const desktop = getHost().capabilities.extensionPush;
  if (effective !== 'demo') return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sub-2)] bg-[var(--bg-elev)] px-4 py-2 text-xs md:px-6">
      <span>
        <strong className="text-[var(--main)]">Demo data.</strong>{' '}
        {realCount === 0 || realCount === null
          ? desktop
            ? 'These charts are made up. Install the browser extension (Data > Browser extension), then finish a test on monkeytype.com. It appears here automatically.'
            : 'These charts are made up. Install the TypeLens extension, finish a test on monkeytype.com, then open Data and press Sync.'
          : `You have ${realCount} real test${realCount === 1 ? '' : 's'}, but demo data is switched on.`}
      </span>
      <span className="flex gap-3">
        {pref === 'demo' && (
          <button className="underline hover:text-[var(--main)]" onClick={() => setPref('auto')}>
            Use my data
          </button>
        )}
        <Link className="underline hover:text-[var(--main)]" to="/data">
          Go to Data
        </Link>
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
  useHostNavigation(); // desktop menu: Ctrl/Cmd+1..9 switch pages, File > Import / Export
  const local = getHost().kind === 'desktop' ? 'this computer' : 'this browser';
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <UpdateBanner />
        <FilterBar />
        <DemoBanner />
        <main className="flex-1 p-4 md:p-6">
          <ErrorBoundary label="page">
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
