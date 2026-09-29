// useCustomerSignals — reads the account_customer_signals view (Customer phase)
// for the org and exposes a per-account map plus a manual reclassify trigger.
//
// One hook per USE CASE, not per operation (the convention the sales-CRM work
// settled on): `list` + `reclassify` belong to the same screen and share a
// cache key, so splitting them would just mean two hooks invalidating each
// other.

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';
import type { PipelineStage } from '@/lib/transitionStage';
import {
  type CustomerSignals,
  type CustomerThresholds,
  type SignalQuality,
  DEFAULT_CUSTOMER_THRESHOLDS,
} from '@/lib/customerSignals';

/**
 * Postgres numerics arrive as strings over PostgREST. Coercing to `0` here
 * would be a lie for every nullable signal — a customer with no baseline is not
 * a customer at zero — so this preserves null and only converts real values.
 */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
};
const num0 = (v: unknown): number => num(v) ?? 0;

/**
 * The view carries a few columns the classifier has no opinion about but the
 * table view and the account page do. They live here rather than on
 * `CustomerSignals` on purpose: that interface is a line-by-line mirror of
 * `classify_customer_stages()`, and widening it with display-only fields would
 * blur what the classifier actually reads.
 */
export interface CustomerSignalRow extends CustomerSignals {
  /** Health score today minus health score 30 days ago. `null` without a baseline. */
  healthDelta30d: number | null;
  /** Written by the classifier; mirrored here so the table need not join. */
  customerRiskReason: string | null;
}

export function useCustomerSignals(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['customer-signals', orgId] as const,
    enabled: !!orgId && enabled,
    queryFn: async (): Promise<CustomerSignalRow[]> => {
      const { data, error } = await db
        .from('account_customer_signals')
        .select('*')
        .eq('organization_id', orgId!);
      if (error) throw error;
      return (data ?? [])
        .filter((r: Record<string, unknown>) => r.account_id)
        .map((r: Record<string, unknown>): CustomerSignalRow => ({
          accountId: r.account_id as string,
          pipelineStage: r.pipeline_stage as PipelineStage,
          customerSince: (r.customer_since as string) ?? null,
          firstUsageAt: (r.first_usage_at as string) ?? null,
          lastUsageAt: (r.last_usage_at as string) ?? null,
          reactivatedAt: (r.reactivated_at as string) ?? null,
          customerStagePinnedAt: (r.customer_stage_pinned_at as string) ?? null,
          usage4w: num0(r.usage_4w),
          usagePrev4w: num0(r.usage_prev_4w),
          usageDeltaPct: num(r.usage_delta_pct),
          weeksSinceLastUsage: num(r.weeks_since_last_usage),
          daysSinceLastActivity: num(r.days_since_last_activity),
          healthScore: num(r.health_score),
          healthLoggedAt: (r.health_logged_at as string) ?? null,
          cohort: (r.cohort as 'M0' | 'M1+' | null) ?? null,
          signalQuality: (r.signal_quality as SignalQuality) ?? 'none',
          // Display-only extras — see CustomerSignalRow.
          healthDelta30d: num(r.health_delta_30d),
          customerRiskReason: (r.customer_risk_reason as string) ?? null,
        }));
    },
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const byAccount = useMemo(
    () => new Map(rows.map((r) => [r.accountId, r])),
    [rows],
  );

  /**
   * Founder-only "Reclassify now". The nightly job is the normal path; this is
   * for the moment after something changes and someone wants the board to
   * catch up without waiting until morning.
   */
  const reclassify = useCallback(async () => {
    const { data, error } = await db.rpc('classify_customer_stages', {
      _org_id: orgId ?? null,
    });
    if (!error) {
      await qc.invalidateQueries({ queryKey: ['customer-signals', orgId] });
      await qc.invalidateQueries({ queryKey: ['accounts'] });
    }
    // The RPC returns one row per account that actually MOVED, so the length is
    // a meaningful "n accounts reclassified" for the toast.
    return { moved: (data as unknown[] | null)?.length ?? 0, error };
  }, [orgId, qc]);

  const thresholds: CustomerThresholds = DEFAULT_CUSTOMER_THRESHOLDS;

  return { rows, byAccount, thresholds, loading: query.isLoading, reclassify };
}
