// useHygieneCounters — the zero-target hygiene counters.
//
// One RPC at drill-down grain (account_hygiene_flags) and the aggregation done
// client-side by buildCounterBoard(): the board and its cell drill-downs come
// from the same fetch, so a count and the accounts behind it can never
// disagree.

import { useQuery } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useOrgContext } from '@/hooks/useDashboardMetrics';
import { buildCounterBoard, type CounterBoard, type HygieneFlagRow } from '@/lib/hygieneCounters';

/** One row as the RPC returns it, before camel-casing. */
interface HygieneFlagDbRow {
  account_id: string;
  account_name: string;
  pipeline_stage: string | null;
  flag: string;
  detail: string | null;
  owner_user_id: string | null;
  owner_display_name: string | null;
}

const EMPTY_ROWS: HygieneFlagRow[] = [];

export function useHygieneCounters(): {
  rows: HygieneFlagRow[];
  board: CounterBoard;
  isLoading: boolean;
  error: Error | null;
} {
  const { orgId, profileLoading, profileError } = useOrgContext();

  const query = useQuery({
    queryKey: ['dashboard', 'hygiene-counters', orgId] as const,
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<HygieneFlagRow[]> => {
      const { data, error } = await (db.rpc as CallableFunction)(
        'account_hygiene_flags',
        { _org_id: orgId! },
      ) as { data: HygieneFlagDbRow[] | null; error: Error | null };
      if (error) throw error;
      return (data ?? []).map((r) => ({
        accountId: r.account_id,
        accountName: r.account_name,
        pipelineStage: r.pipeline_stage,
        flag: r.flag,
        detail: r.detail,
        ownerUserId: r.owner_user_id,
        ownerDisplayName: r.owner_display_name,
      }));
    },
  });

  const rows = query.data ?? EMPTY_ROWS;

  return {
    rows,
    board: buildCounterBoard(rows),
    isLoading: profileLoading || query.isLoading,
    error: profileError ?? (query.error as Error) ?? null,
  };
}
