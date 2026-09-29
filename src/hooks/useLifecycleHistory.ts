import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/contexts/AuthContext';
import {
  LIFECYCLE_GROUP_LABEL,
  buildStageTitle,
  sortLifecycle,
  type LifecycleEventLike,
} from '@/lib/lifecycle';

export type LifecycleEvent = LifecycleEventLike & {
  account_id: string;
  organization_id: string;
};

/**
 * Fetches and mutates lifecycle transition events for an account.
 * All operations write to the existing `events` table with group_label='lifecycle'.
 */
export function useLifecycleHistory(accountId: string | undefined) {
  const { profile } = useProfile();
  const { user } = useAuth();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();

  const queryKey = ['lifecycle-history', orgId, accountId] as const;

  const { data: history = [], isLoading: loading, refetch } = useQuery({
    queryKey,
    enabled: !!orgId && !!accountId,
    queryFn: async () => {
      const { data, error } = await db
        .from('events')
        .select('id, title, summary, date, created_at, group_label, account_id, organization_id')
        .eq('organization_id', orgId!)
        .eq('account_id', accountId!)
        .eq('group_label', LIFECYCLE_GROUP_LABEL)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as LifecycleEvent[];
    },
  });

  const ordered = useMemo(() => sortLifecycle(history), [history]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['lifecycle-history', orgId, accountId] });
    qc.invalidateQueries({ queryKey: ['events', orgId] });
    qc.invalidateQueries({ queryKey: ['accounts'] });
  }, [qc, orgId, accountId]);

  /**
   * Updates a lifecycle event's date (and optional note). We update both
   * `date` and `created_at` so the chronological ordering used everywhere
   * matches the new wall-clock date.
   */
  const updateLifecycleEvent = useCallback(
    async (eventId: string, params: { date: Date; note?: string | null }) => {
      const iso = params.date.toISOString();
      const dateOnly = iso.slice(0, 10);
      const patch: { date: string; created_at: string; summary?: string | null } = {
        date: dateOnly,
        created_at: iso,
      };
      if (params.note !== undefined) {
        patch.summary = params.note?.trim() ? params.note.trim() : null;
      }
      const { error } = await db.from('events').update(patch).eq('id', eventId);
      if (error) throw error;
      invalidate();
    },
    [invalidate]
  );

  /**
   * Inserts a backfilled stage transition. Does NOT change accounts.pipeline_stage,
   * so the auto-trigger does not fire.
   */
  const insertLifecycleEvent = useCallback(
    async (params: { stage: string; date: Date; note?: string | null }) => {
      if (!orgId || !accountId || !user) throw new Error('Not authenticated');
      const iso = params.date.toISOString();
      const { error } = await db.from('events').insert({
        account_id: accountId,
        organization_id: orgId,
        user_id: user.id,
        type: 'system',
        channel: 'system',
        direction: 'internal',
        title: buildStageTitle(params.stage),
        summary: params.note?.trim() ? params.note.trim() : `Backfilled: stage set to ${params.stage}`,
        group_label: LIFECYCLE_GROUP_LABEL,
        date: iso.slice(0, 10),
        created_at: iso,
      });
      if (error) throw error;
      invalidate();
    },
    [orgId, accountId, user, invalidate]
  );

  /**
   * Deletes a lifecycle event. If it was the most recent transition, the DB helper
   * `revert_lifecycle_on_delete` will roll the account's current stage back to the
   * previous one — must be called BEFORE the delete so it can read the row.
   */
  const deleteLifecycleEvent = useCallback(
    async (eventId: string) => {
      // Ask the server to revert accounts.pipeline_stage if needed (no-op if not latest).
      const { error: rpcError } = await db.rpc('revert_lifecycle_on_delete', {
        _event_id: eventId,
      });
      if (rpcError) throw rpcError;
      const { error } = await db.from('events').delete().eq('id', eventId);
      if (error) throw error;
      invalidate();
    },
    [invalidate]
  );

  return {
    history: ordered,
    loading,
    refetch,
    updateLifecycleEvent,
    insertLifecycleEvent,
    deleteLifecycleEvent,
  };
}