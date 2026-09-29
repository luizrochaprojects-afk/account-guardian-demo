import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { subDays, format, parseISO, isValid, startOfDay } from 'date-fns';

/**
 * Owns every URL parameter on /dashboard: `?tab` and `?since`.
 *
 * WHY ONE HOOK: when a period control owns its own URL writes *and* hydrates
 * itself from the URL through a mount effect, every other reader of the same
 * window becomes a second writer — two writers, one URL, and races between
 * them. Here there is exactly one `useSearchParams` writer on the page and the
 * control is fully controlled, so no hydration effect is needed at all.
 *
 * `?tab` selects the dashboard tab; unknown values fall back to the default so
 * a stale link never renders a blank page. `?since` is the start of a rolling
 * window (YYYY-MM-DD) that every chart on the page reads.
 */
export const DASHBOARD_TABS = ['pipeline'] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export const DEFAULT_TAB: DashboardTab = 'pipeline';
export const DEFAULT_SINCE_DAYS = 28;

export type PresetKey = '7' | '28' | '90' | 'custom';

export const PERIOD_PRESETS: { key: PresetKey; label: string; days: number | null }[] = [
  { key: '7', label: 'This week', days: 7 },
  { key: '28', label: 'Last 4 weeks', days: 28 },
  { key: '90', label: 'This quarter', days: 90 },
  { key: 'custom', label: 'Custom', days: null },
];

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Parse a YYYY-MM-DD param, or `null` when absent/garbage. Never throws. */
function parseDateParam(raw: string | null): Date | null {
  if (!raw) return null;
  const parsed = parseISO(raw);
  return isValid(parsed) ? startOfDay(parsed) : null;
}

export function resolveTab(raw: string | null): DashboardTab {
  return DASHBOARD_TABS.includes(raw as DashboardTab) ? (raw as DashboardTab) : DEFAULT_TAB;
}

/** Which preset a `since` date corresponds to, for highlighting the control. */
export function presetFromSince(since: Date, now: Date = new Date()): PresetKey {
  const diffDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(since).getTime()) / 86_400_000,
  );
  if (diffDays === 7) return '7';
  if (diffDays === 28) return '28';
  if (diffDays === 90) return '90';
  return 'custom';
}

export interface DashboardPeriod {
  tab: DashboardTab;
  since: Date;
  sinceIso: string;
  preset: PresetKey;
  /** Whole weeks spanned by the window, clamped to a chart-sensible 4..26. */
  weeksInWindow: number;
  setTab: (tab: DashboardTab) => void;
  setSince: (since: Date) => void;
  setPreset: (preset: PresetKey) => void;
}

export function useDashboardPeriod(): DashboardPeriod {
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = resolveTab(searchParams.get('tab'));
  const since = parseDateParam(searchParams.get('since'))
    ?? startOfDay(subDays(new Date(), DEFAULT_SINCE_DAYS));

  /**
   * `replace: true` throughout: changing tab or window is not navigation. Pushing would
   * bury the back button under a stack of changes, so leaving the dashboard
   * would take one Back press per flip.
   */
  const patch = useCallback(
    (changes: Record<string, string>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) next.set(k, v);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setTab = useCallback((next: DashboardTab) => patch({ tab: next }), [patch]);
  const setSince = useCallback((d: Date) => patch({ since: toISODate(startOfDay(d)) }), [patch]);

  const setPreset = useCallback(
    (key: PresetKey) => {
      const preset = PERIOD_PRESETS.find((p) => p.key === key);
      if (!preset?.days) return; // 'custom' is driven by setSince
      patch({ since: toISODate(startOfDay(subDays(new Date(), preset.days))) });
    },
    [patch],
  );

  return useMemo(() => {
    const windowDays = Math.max(
      1,
      Math.round((startOfDay(new Date()).getTime() - since.getTime()) / 86_400_000),
    );
    return {
      tab,
      since,
      sinceIso: toISODate(since),
      preset: presetFromSince(since),
      weeksInWindow: Math.min(26, Math.max(4, Math.ceil(windowDays / 7))),
      setTab,
      setSince,
      setPreset,
    };
  }, [tab, since, setTab, setSince, setPreset]);
}
