import { useEffect, useRef } from "react";
import { useCustomViews, type CustomView } from "@/hooks/useCustomViews";
import type { AnyFilters } from "@/lib/viewFilters";

/**
 * Auto-persist display-option changes (grouping, ordering, column visibility,
 * etc.) back to the saved view when the user is viewing one (e.g. on
 * /views/:id). Only display-related keys are persisted — search/filter values
 * stay session-local because typing in the search box should not mutate the
 * saved view.
 *
 * Debounced so toggling a few columns in a row results in a single write.
 */

// Keys we treat as "display options" and are safe to write back automatically.
// Anything not listed here (status, priority, search, etc.) is considered a
// filter and is left alone — the user must explicitly Save to update those.
const DISPLAY_KEYS = [
  // issues + projects
  "grouping", "ordering", "orderingDir", "displayProperties",
  "completed", "showSubIssues",
  // accounts
  "groupBy", "sortBy", "sortDir", "visibleColumns",
] as const;

function pickDisplay(filters: AnyFilters): Partial<AnyFilters> {
  const out: Record<string, unknown> = {};
  for (const k of DISPLAY_KEYS) {
    const v = (filters as any)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<AnyFilters>;
}

function shallowEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    const av = a[k], bv = b[k];
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length) return false;
      for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
    } else if (av !== bv) {
      return false;
    }
  }
  return true;
}

export function useViewDisplayPersist(
  activeView: CustomView | null | undefined,
  currentFilters: AnyFilters,
  delayMs = 600,
) {
  const { updateView } = useCustomViews();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the last display snapshot we wrote so we don't re-issue the same
  // mutation on unrelated state changes.
  const lastWrittenRef = useRef<Partial<AnyFilters> | null>(null);
  // Skip the first fire after an activeView change — that pass is the page
  // hydrating its local state from the freshly-loaded view, not a real edit.
  const hydratedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeView) return;
    // First effect run for this view id: capture the baseline as "already
    // written" so we don't immediately echo it back.
    if (hydratedForRef.current !== activeView.id) {
      hydratedForRef.current = activeView.id;
      lastWrittenRef.current = pickDisplay(activeView.filters);
      return;
    }

    const nextDisplay = pickDisplay(currentFilters);
    if (shallowEqual(nextDisplay, lastWrittenRef.current)) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const mergedFilters = {
        ...(activeView.filters as any),
        ...nextDisplay,
      } as AnyFilters;
      lastWrittenRef.current = nextDisplay;
      updateView.mutate({ id: activeView.id, patch: { filters: mergedFilters } });
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // We deliberately depend on a stringified projection so we only re-run
    // when display values actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView?.id, JSON.stringify(pickDisplay(currentFilters))]);
}