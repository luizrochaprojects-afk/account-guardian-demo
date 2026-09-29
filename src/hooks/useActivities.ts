// useActivities — data layer for prospecting activities.
// One hook grouped by use case (list + logActivity), per
// one-hook-per-use-case convention, rather than one hook per operation.

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';
import type { Tables } from '@/types/database';
import type {
  ActivityChannel, ActivityType, ActivityDirection, ActivityOutcome,
} from '@/lib/activityOptions';

export type DbActivity = Tables<'activities'>;

export interface NewActivity {
  account_id: string;
  contact_id?: string | null;
  occurred_at?: string;
  channel: ActivityChannel;
  activity_type: ActivityType;
  direction: ActivityDirection;
  outcome?: ActivityOutcome | null;
  notes?: string | null;
}

export function useActivities(accountId?: string) {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();
  const key = ['activities', orgId, accountId ?? null] as const;

  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: key,
    enabled: !!orgId && !!accountId,
    queryFn: async (): Promise<DbActivity[]> => {
      const { data, error } = await db
        .from('activities')
        .select('*')
        .eq('organization_id', orgId!)
        .eq('account_id', accountId!)
        .order('occurred_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const activities = useMemo(() => data ?? [], [data]);

  const invalidate = useCallback(() => {
    // Any account's activity changes the org-wide dashboard rollup too.
    qc.invalidateQueries({ queryKey: ['activities', orgId] });
    qc.invalidateQueries({ queryKey: ['activity-metrics', orgId] });
  }, [qc, orgId]);

  const logActivity = useCallback(async (input: NewActivity) => {
    if (!orgId) return { data: null, error: new Error('Missing org') };
    const { data, error } = await db
      .from('activities')
      .insert({
        organization_id: orgId,
        account_id: input.account_id,
        contact_id: input.contact_id ?? null,
        occurred_at: input.occurred_at ?? new Date().toISOString(),
        channel: input.channel,
        activity_type: input.activity_type,
        direction: input.direction,
        outcome: input.outcome ?? null,
        notes: input.notes ?? null,
        source: 'manual',
      })
      .select()
      .single();
    if (!error) invalidate();
    return { data, error };
  }, [orgId, invalidate]);

  return { activities, loading, refetch, logActivity };
}
