import { useEffect, useState } from 'react';

export type SortDir = 'asc' | 'desc';

export interface ListingPrefsConfig<SortKey extends string> {
  /** Stable page key (e.g. 'projects', 'notes', 'requests'). */
  pageKey: string;
  /** Org id used to namespace prefs. Falls back to 'anon' until profile loads. */
  orgId: string | undefined | null;
  /** Default visible column keys. */
  defaultColumns: string[];
  /** Default sort key. */
  defaultSort: SortKey;
  /** Default sort direction. */
  defaultDir?: SortDir;
  /**
   * When true, skip ALL localStorage interaction (read on init, hydrate, write).
   * Used when the listing is rendering a saved custom view: in that mode the
   * saved view's filters are the single source of truth and LS would race /
   * leak state.
   */
  skipPersistence?: boolean;
}

function safeRead(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeWrite(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}
function safeRemove(key: string) {
  try { localStorage.removeItem(key); } catch {}
}

/**
 * Persisted listing preferences (visible columns, sort key, sort direction).
 * Mirrors the pattern used by `AllAccounts.tsx` so all listing pages behave consistently.
 * Hydrates once `orgId` resolves to avoid clobbering stored values with defaults.
 */
export function useListingPrefs<SortKey extends string>(config: ListingPrefsConfig<SortKey>) {
  const { pageKey, orgId, defaultColumns, defaultSort, defaultDir = 'desc', skipPersistence = false } = config;
  const ns = `${pageKey}:${orgId ?? 'anon'}`;
  const COLS_KEY = `${ns}:visibleColumns`;
  const SORT_KEY = `${ns}:sort`;
  const SORT_DIR_KEY = `${ns}:sortDir`;

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    if (skipPersistence) return new Set(defaultColumns);
    const raw = safeRead(COLS_KEY);
    if (raw) {
      try { return new Set(JSON.parse(raw)); } catch {}
    }
    return new Set(defaultColumns);
  });
  const [sortBy, setSortBy] = useState<SortKey>(() => {
    if (skipPersistence) return defaultSort;
    const v = safeRead(SORT_KEY);
    return (v as SortKey) || defaultSort;
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    if (skipPersistence) return defaultDir;
    const v = safeRead(SORT_DIR_KEY);
    return v === 'asc' || v === 'desc' ? v : defaultDir;
  });

  // Re-hydrate once orgId resolves (initial render may have used 'anon').
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!orgId || hydrated) return;
    if (skipPersistence) { setHydrated(true); return; }
    const cols = safeRead(COLS_KEY);
    if (cols) {
      try { setVisibleColumns(new Set(JSON.parse(cols))); } catch {}
    }
    const s = safeRead(SORT_KEY);
    if (s) setSortBy(s as SortKey);
    const sd = safeRead(SORT_DIR_KEY);
    if (sd === 'asc' || sd === 'desc') setSortDir(sd);
    setHydrated(true);
  }, [orgId, hydrated, COLS_KEY, SORT_KEY, SORT_DIR_KEY, skipPersistence]);

  useEffect(() => {
    if (!hydrated) return;
    if (skipPersistence) return;
    safeWrite(COLS_KEY, JSON.stringify([...visibleColumns]));
  }, [hydrated, visibleColumns, COLS_KEY, skipPersistence]);
  useEffect(() => {
    if (!hydrated) return;
    if (skipPersistence) return;
    safeWrite(SORT_KEY, sortBy);
  }, [hydrated, sortBy, SORT_KEY, skipPersistence]);
  useEffect(() => {
    if (!hydrated) return;
    if (skipPersistence) return;
    safeWrite(SORT_DIR_KEY, sortDir);
  }, [hydrated, sortDir, SORT_DIR_KEY, skipPersistence]);

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const isColVisible = (key: string) => visibleColumns.has(key);

  const resetColumns = () => {
    setVisibleColumns(new Set(defaultColumns));
    safeRemove(COLS_KEY);
  };

  return {
    visibleColumns,
    setVisibleColumns,
    toggleColumn,
    isColVisible,
    resetColumns,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
  };
}