import { useQuery } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useOrgContext, orgQueryLoading } from '@/hooks/useOrgContext';
import type { Database } from '@/types/database';

type PipelineStage = Database['public']['Enums']['pipeline_stage'];
type LossReasonCategory = Database['public']['Enums']['loss_reason_category'];

export interface NorthStarCounts {
  accounts_worked: number;
  working_count: number;
  discovery_call_count: number;
  qualified_opp_count: number;
  signoff_count: number;
  active_customer_count: number;
}

export interface LossReasonRow {
  loss_reason_category: LossReasonCategory;
  lost_from_stage: PipelineStage;
  account_count: number;
}

export interface ObjectionRow {
  objection: string;
  occurrence_count: number;
}

const ZERO_COUNTS: NorthStarCounts = {
  accounts_worked: 0,
  working_count: 0,
  discovery_call_count: 0,
  qualified_opp_count: 0,
  signoff_count: 0,
  active_customer_count: 0,
};

/** Postgres numerics arrive as strings over PostgREST; coerce without lying. */
export function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * `useOrgContext` moved to `@/hooks/useOrgContext` so every org-scoped hook in
 * the app can share it, not just the dashboard RPCs. Re-exported here so the
 * existing call sites keep working.
 */
export { useOrgContext, orgQueryLoading } from '@/hooks/useOrgContext';

type NorthStarRow = Database['public']['Functions']['dashboard_north_star_counts']['Returns'][number];

function normalizeNorthStar(row: NorthStarRow | null | undefined): NorthStarCounts {
  if (!row) return ZERO_COUNTS;
  return {
    accounts_worked: toNumber(row.accounts_worked),
    working_count: toNumber(row.working_count),
    discovery_call_count: toNumber(row.discovery_call_count),
    qualified_opp_count: toNumber(row.qualified_opp_count),
    signoff_count: toNumber(row.signoff_count),
    active_customer_count: toNumber(row.active_customer_count),
  };
}

export function useNorthStarCounts(since: Date): {
  data: NorthStarCounts | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { orgId, profileLoading, profileError } = useOrgContext();
  const sinceIso = since.toISOString();

  const query = useQuery({
    queryKey: ['dashboard', 'north-star', orgId, sinceIso] as const,
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<NorthStarCounts> => {
      const { data, error } = await db.rpc(
        'dashboard_north_star_counts',
        { _org_id: orgId!, _since: sinceIso },
      );
      if (error) throw error;
      return normalizeNorthStar(data?.[0]);
    },
  });

  return {
    data: query.data,
    isLoading: orgQueryLoading({ orgId, profileLoading, profileError }, query),
    error: profileError ?? (query.error as Error) ?? null,
  };
}

export function useLossReasons(since: Date): {
  data: LossReasonRow[];
  isLoading: boolean;
  error: Error | null;
} {
  const { orgId, profileLoading, profileError } = useOrgContext();
  const sinceIso = since.toISOString();

  const query = useQuery({
    queryKey: ['dashboard', 'loss-reasons', orgId, sinceIso] as const,
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<LossReasonRow[]> => {
      const { data, error } = await db.rpc(
        'dashboard_loss_reasons',
        { _org_id: orgId!, _since: sinceIso },
      );
      if (error) throw error;
      return (data ?? []).map((r) => ({
        loss_reason_category: r.loss_reason_category,
        lost_from_stage: r.lost_from_stage,
        account_count: toNumber(r.account_count),
      }));
    },
  });

  return {
    data: query.data ?? [],
    isLoading: orgQueryLoading({ orgId, profileLoading, profileError }, query),
    error: profileError ?? (query.error as Error) ?? null,
  };
}

export function useTopObjections(since: Date): {
  data: ObjectionRow[];
  isLoading: boolean;
  error: Error | null;
} {
  const { orgId, profileLoading, profileError } = useOrgContext();
  const sinceIso = since.toISOString();

  const query = useQuery({
    queryKey: ['dashboard', 'top-objections', orgId, sinceIso] as const,
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<ObjectionRow[]> => {
      const { data, error } = await db.rpc(
        'dashboard_objections',
        { _org_id: orgId!, _since: sinceIso },
      );
      if (error) throw error;
      return (data ?? []).map((r) => ({
        objection: r.objection ?? '',
        occurrence_count: toNumber(r.occurrence_count),
      }));
    },
  });

  return {
    data: query.data ?? [],
    isLoading: orgQueryLoading({ orgId, profileLoading, profileError }, query),
    error: profileError ?? (query.error as Error) ?? null,
  };
}
