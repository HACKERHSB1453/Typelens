import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AnalysisFilters, SessionConfig } from '@/data/types';
import { useDataSource, useDataVersion } from '@/data';

export type RangePreset = '7d' | '30d' | '90d' | 'all';
const DAY = 86_400_000;

interface FiltersValue {
  filters: AnalysisFilters;
  rangePreset: RangePreset;
  modes: SessionConfig['mode'][];
  languages: string[];
  minSamples: number;
  includeSpaceNgrams: boolean;
  practiceOnly: boolean;
  excludeFlagged: boolean;
  availableLanguages: string[];
  availableModes: SessionConfig['mode'][];
  setRangePreset: (r: RangePreset) => void;
  toggleMode: (m: SessionConfig['mode']) => void;
  toggleLanguage: (l: string) => void;
  setMinSamples: (n: number) => void;
  setIncludeSpaceNgrams: (b: boolean) => void;
  setPracticeOnly: (b: boolean) => void;
  setExcludeFlagged: (b: boolean) => void;
  reset: () => void;
}

const DEFAULTS = {
  rangePreset: '90d' as RangePreset,
  modes: [] as SessionConfig['mode'][],
  languages: [] as string[],
  minSamples: 5,
  includeSpaceNgrams: false,
  practiceOnly: false,
  excludeFlagged: true, // captures that disagree with Monkeytype's own result are kept but not analysed
};

const FiltersContext = createContext<FiltersValue | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const ds = useDataSource();
  const dataVersion = useDataVersion();
  const [rangePreset, setRangePreset] = useState<RangePreset>(DEFAULTS.rangePreset);
  const [modes, setModes] = useState<SessionConfig['mode'][]>(DEFAULTS.modes);
  const [languages, setLanguages] = useState<string[]>(DEFAULTS.languages);
  const [minSamples, setMinSamples] = useState<number>(DEFAULTS.minSamples);
  const [includeSpaceNgrams, setIncludeSpaceNgrams] = useState<boolean>(DEFAULTS.includeSpaceNgrams);
  const [practiceOnly, setPracticeOnly] = useState<boolean>(DEFAULTS.practiceOnly);
  const [excludeFlagged, setExcludeFlagged] = useState<boolean>(DEFAULTS.excludeFlagged);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [availableModes] = useState<SessionConfig['mode'][]>(['time', 'words', 'quote', 'zen', 'custom']);

  // Discover the distinct languages present in the dataset (again whenever the data changes).
  useEffect(() => {
    let alive = true;
    ds.listSessions()
      .then((all) => {
        if (!alive) return;
        const langs = Array.from(new Set(all.map((s) => s.config.language))).sort();
        setAvailableLanguages(langs);
      })
      .catch(() => {
        /* surfaced per-page via StateView */
      });
    return () => {
      alive = false;
    };
  }, [ds, dataVersion]);

  const filters = useMemo<AnalysisFilters>(() => {
    const now = Date.now();
    const from =
      rangePreset === 'all' ? undefined : now - (rangePreset === '7d' ? 7 : rangePreset === '30d' ? 30 : 90) * DAY;
    return {
      from,
      to: undefined,
      modes: modes.length ? modes : undefined,
      languages: languages.length ? languages : undefined,
      minSamples,
      includeSpaceNgrams,
      practiceOnly,
      excludeFlagged,
    };
    // dataVersion: a window like "last 7 days" must slide forward in an app that stays open for days
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangePreset, modes, languages, minSamples, includeSpaceNgrams, practiceOnly, excludeFlagged, dataVersion]);

  const toggleMode = (m: SessionConfig['mode']) =>
    setModes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  const toggleLanguage = (l: string) =>
    setLanguages((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));

  const reset = () => {
    setRangePreset(DEFAULTS.rangePreset);
    setModes(DEFAULTS.modes);
    setLanguages(DEFAULTS.languages);
    setMinSamples(DEFAULTS.minSamples);
    setIncludeSpaceNgrams(DEFAULTS.includeSpaceNgrams);
    setPracticeOnly(DEFAULTS.practiceOnly);
    setExcludeFlagged(DEFAULTS.excludeFlagged);
  };

  const value: FiltersValue = {
    filters,
    rangePreset,
    modes,
    languages,
    minSamples,
    includeSpaceNgrams,
    practiceOnly,
    excludeFlagged,
    availableLanguages,
    availableModes,
    setRangePreset,
    toggleMode,
    toggleLanguage,
    setMinSamples,
    setIncludeSpaceNgrams,
    setPracticeOnly,
    setExcludeFlagged,
    reset,
  };

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters(): FiltersValue {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters must be used within a FiltersProvider');
  return ctx;
}
