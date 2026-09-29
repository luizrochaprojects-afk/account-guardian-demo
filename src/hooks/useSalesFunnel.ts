// useSalesFunnel — the single funnel on Dashboard > Pipeline, via
// dashboard_sales_funnel: per spine step, the windowed entry cohort, its money,
// conversion to the next step or beyond, and median days to get there.
//
// Final step: won = first real usage INSIDE THE WINDOW, not the closed_won
// stage. A signature without usage is a promise, not a customer.
//
// `includeLegacy` turns the current-state backstop back on (accounts that are
// live today count as one entered+converted unit in every step with no visible
// windowed entry). It reads a workspace whose history predates the window, at
// the cost of the tail no longer being flow — which is why it is off by default
// and the UI has to say when it is on.

import { useQuery } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useOrgContext, toNumber } from '@/hooks/useDashboardMetrics';

/** One row as the RPC returns it; numerics may arrive as strings. */
interface SalesFunnelDbRow {
  step: unknown;
  step_order: unknown;
  entered: unknown;
  arr_total: unknown;
  current_mrr_total: unknown;
  converted: unknown;
  conversion_rate: unknown;
  median_days_to_next: unknown;
}

export interface SalesFunnelRow {
  /** 'working'..'sign_off' plus the synthetic 'first_usage'. */
  step: string;
  stepOrder: number;
  entered: number;
  arrTotal: number;
  currentMrrTotal: number;
  converted: number | null;
  /** Fraction 0–1, or null when there is no next step / no cohort. */
  rate: number | null;
  medianDaysToNext: number | null;
}

const nullable = (v: unknown): number | null =>
  v === null || v === undefined ? null : toNumber(v);

export function useSalesFunnel(since: Date, includeLegacy = false) {
  const { orgId, profileLoading, profileError } = useOrgContext();
  const sinceIso = since.toISOString();

  const query = useQuery({
    // includeLegacy is part of the key: the two modes are different numbers for
    // the same window, and sharing a cache entry would show one while the toggle
    // claims the other.
    queryKey: ['dashboard', 'sales-funnel', orgId, sinceIso, includeLegacy] as const,
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<SalesFunnelRow[]> => {
      const { data, error } = await (db.rpc as CallableFunction)(
        'dashboard_sales_funnel',
        { _org_id: orgId!, _since: sinceIso, _include_legacy: includeLegacy },
      ) as { data: SalesFunnelDbRow[] | null; error: Error | null };
      if (error) throw error;
      return (data ?? []).map((row) => ({
        step: String(row.step),
        stepOrder: toNumber(row.step_order),
        entered: toNumber(row.entered),
        arrTotal: toNumber(row.arr_total),
        currentMrrTotal: toNumber(row.current_mrr_total),
        converted: nullable(row.converted),
        rate: nullable(row.conversion_rate),
        medianDaysToNext: nullable(row.median_days_to_next),
      }));
    },
  });

  return {
    data: query.data ?? [],
    isLoading: profileLoading || query.isLoading,
    error: profileError ?? (query.error as Error) ?? null,
  };
}
