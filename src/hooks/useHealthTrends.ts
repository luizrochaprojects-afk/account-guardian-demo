// useHealthTrends — latest vs. previous health_score_logs total per account.
// Logs are the source of truth for displayed health: no log → no data,
// regardless of accounts.health_score. Shared by the accounts Table view and
// the pipeline kanban cards (react-query dedupes the org-wide fetch).

import { useQuery } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';

export type HealthTrendMap = Record<string, { latest: number; previous: number | null }>;

export function useHealthTrends(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const { profile } = useProfile();
  const orgId = profile?.organization_id;

  const query = useQuery({
    queryKey: ['health_score_trends', orgId],
    enabled: !!orgId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<HealthTrendMap> => {
      const { data } = await db
        .from('health_score_logs')
        .select('account_id, total_score, logged_at, created_at')
        .eq('organization_id', orgId!)
        .order('logged_at', { ascending: false })
        .order('created_at', { ascending: false });
      const map: HealthTrendMap = {};
      (data || []).forEach((r) => {
        const aid = String(r.account_id);
        if (!map[aid]) {
          map[aid] = { latest: r.total_score, previous: null };
        } else if (map[aid].previous === null) {
          map[aid].previous = r.total_score;
        }
      });
      return map;
    },
  });

  return { trends: query.data ?? {}, loading: query.isLoading };
}
