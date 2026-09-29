import { useQuery } from '@tanstack/react-query';
import { db } from '@/demo/db';

export interface HealthLog {
  id: string;
  logged_at: string;
  scores: Record<string, unknown>;
  total_score: number;
  observation: string | null;
  metrics_snapshot?: unknown;
  profile_name?: string | null;
}

export function healthLogsQuery(accountId: string | undefined) {
  return {
    queryKey: ['health_score_logs', accountId] as const,
    enabled: !!accountId,
    queryFn: async () => {
      const { data } = await db
        .from('health_score_logs')
        .select('id, logged_at, scores, total_score, observation, metrics_snapshot, profile_name')
        .eq('account_id', accountId!)
        .order('logged_at', { ascending: true });
      return (data || []) as unknown as HealthLog[];
    },
  };
}

export function useHealthLogs(accountId: string | undefined) {
  const q = healthLogsQuery(accountId);
  const { data = [], isLoading, refetch } = useQuery(q);
  return { logs: data, loading: isLoading, refetch };
}