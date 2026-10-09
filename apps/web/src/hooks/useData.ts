import type { Analysis, AnalysisFilters, ProgressSeries, ReplayData, SessionSummary } from '@/data/types';
import { realDataSource, useDataSource, useDataVersion } from '@/data';
import { useAsyncResource } from './useAsyncResource';

// Every hook re-fetches when its inputs change OR when the data changes (sync, import, delete, demo -> real).

export function useSessions(filters?: AnalysisFilters) {
  const ds = useDataSource();
  const v = useDataVersion();
  const key = JSON.stringify(filters ?? null);
  return useAsyncResource<SessionSummary[]>(() => ds.listSessions(filters), [ds, key, v]);
}

export function useAnalysis(filters?: AnalysisFilters) {
  const ds = useDataSource();
  const v = useDataVersion();
  const key = JSON.stringify(filters ?? null);
  return useAsyncResource<Analysis>(() => ds.getAnalysis(filters), [ds, key, v]);
}

export function useProgress(filters?: AnalysisFilters) {
  const ds = useDataSource();
  const v = useDataVersion();
  const key = JSON.stringify(filters ?? null);
  return useAsyncResource<ProgressSeries>(() => ds.getProgress(filters), [ds, key, v]);
}

export function useReplay(sessionId: string | undefined) {
  const ds = useDataSource();
  const v = useDataVersion();
  return useAsyncResource<ReplayData>(
    () => (sessionId ? ds.getReplay(sessionId) : Promise.reject(new Error('No session id'))),
    [ds, sessionId, v],
  );
}

/** The real stored sessions, regardless of whether the rest of the UI is showing demo data. */
export function useStoredSessions() {
  const v = useDataVersion();
  return useAsyncResource<SessionSummary[]>(() => realDataSource.listSessions(), [v]);
}