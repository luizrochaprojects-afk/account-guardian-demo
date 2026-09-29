// useAgentSuggestions — react-query bundle for the Agent Inbox.
//
// One hook on purpose (the codebase convention: "group by use case
// instead of one-hook-per-table"). It exposes a list query plus the three
// mutations the inbox needs (approve, reject, batch approve). All mutations
// invalidate the same query keys, so optimistic updates aren't necessary
// for v1 — the inbox refreshes the whole pending list after a single
// invalidation.
//
// The agent tables are read through a loosely typed client, with
// `src/types/agent.ts` as the row shapes.

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';
import { toast } from 'sonner';
import type {
  AgentSuggestion,
  SuggestionStatus,
  SuggestionWithContext,
} from '@/types/agent';

// Loose client lets us hit the agent_* tables before 1.10 regen lands.
// Once types are regenerated this cast can be deleted.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseFrom = (table: string) => any;
const sb = db as unknown as {
  from: LooseFrom;
  functions: typeof db.functions;
};

export interface SuggestionFilters {
  status?: SuggestionStatus | 'all';
  accountId?: string | null;
  meetingIngestId?: string | null;
  // Used by the "Stale" tab: only sugs older than N days.
  olderThanDays?: number;
}

export interface ApproveEdits {
  account_id?: string;
  title?: string;
  description?: string;
  due_date?: string;
  assignee_user_id?: string;
  content_markdown?: string;
  incumbent_vendor?: string;
  incumbent_evidence?: string;
  incumbent_last_renewal?: string;
  incumbent_cycle?: 'annual' | 'biennial' | 'monthly' | 'unknown';
}

const KEY_PENDING_COUNT = 'agent_suggestions_pending_count';

export function useAgentSuggestions(filters: SuggestionFilters = {}) {
  const { profile } = useProfile();
  const qc = useQueryClient();
  const orgId = profile?.organization_id;

  const queryKey = useMemo(
    () => [
      'agent_suggestions',
      orgId,
      filters.status ?? 'pending',
      filters.accountId ?? null,
      filters.meetingIngestId ?? null,
      filters.olderThanDays ?? null,
    ],
    [orgId, filters.status, filters.accountId, filters.meetingIngestId, filters.olderThanDays],
  );

  const list = useQuery<SuggestionWithContext[]>({
    queryKey,
    enabled: !!orgId,
    queryFn: async () => {
      // Pull suggestions + meeting + account name in one round-trip via the
      // PostgREST embed syntax. RLS scopes both joined tables to the same org.
      // The `meeting:meeting_ingests` embed must name the FK explicitly —
      // meeting_ingests.produces_qualification_update_id is a second FK to
      // agent_suggestions,
      // so the unqualified embed is ambiguous (PostgREST PGRST201, HTTP 300)
      // and silently returns nothing to the UI without this.
      let q = sb.from('agent_suggestions').select(`
        *,
        meeting:meeting_ingests!agent_suggestions_meeting_ingest_id_fkey ( id, title, folder_name, meeting_date ),
        account:accounts ( id, name )
      `).eq('organization_id', orgId);

      if (filters.status && filters.status !== 'all') {
        q = q.eq('status', filters.status);
      } else if (!filters.status) {
        q = q.eq('status', 'pending');
      }
      if (filters.accountId) q = q.eq('account_id', filters.accountId);
      if (filters.meetingIngestId) q = q.eq('meeting_ingest_id', filters.meetingIngestId);
      if (filters.olderThanDays && filters.olderThanDays > 0) {
        const cutoff = new Date(Date.now() - filters.olderThanDays * 86400_000).toISOString();
        q = q.lt('created_at', cutoff);
      }

      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;

      type EmbedRow = AgentSuggestion & {
        meeting?: { id: string; title: string | null; folder_name: string | null; meeting_date: string | null } | null;
        account?: { id: string; name: string } | null;
      };
      return ((data ?? []) as EmbedRow[]).map((row): SuggestionWithContext => ({
        ...row,
        meeting: row.meeting ?? null,
        account_name: row.account?.name ?? null,
      }));
    },
  });

  const approve = useMutation({
    mutationFn: async (vars: { suggestion_id: string; edits?: ApproveEdits | null }) => {
      const { data, error } = await sb.functions.invoke('agent-approve-suggestion', {
        body: { suggestion_id: vars.suggestion_id, edits: vars.edits ?? null },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.status ?? 'approve_failed');
      return data;
    },
    onSuccess: (data) => {
      toast.success(data?.status === 'edited_approved' ? 'Approved with edits' : 'Approved');
      invalidateAll(qc, orgId);
    },
    onError: (err: Error) => toast.error(`Approve failed: ${err.message}`),
  });

  const reject = useMutation({
    mutationFn: async (vars: { suggestion_id: string; reject_reason?: string | null }) => {
      const { data, error } = await sb.functions.invoke('agent-reject-suggestion', {
        body: { suggestion_id: vars.suggestion_id, reject_reason: vars.reject_reason ?? null },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.status ?? 'reject_failed');
      return data;
    },
    onSuccess: () => {
      toast.success('Rejected');
      invalidateAll(qc, orgId);
    },
    onError: (err: Error) => toast.error(`Reject failed: ${err.message}`),
  });

  const batchApprove = useMutation({
    mutationFn: async (vars: { ids: string[] }) => {
      // No server-side batch endpoint in v1; iterate serially so a 4xx on
      // one suggestion doesn't blow up the rest.
      const results: Array<{ id: string; ok: boolean; error?: string }> = [];
      for (const id of vars.ids) {
        try {
          const { data, error } = await sb.functions.invoke('agent-approve-suggestion', {
            body: { suggestion_id: id, edits: null },
          });
          if (error) results.push({ id, ok: false, error: error.message });
          else if (data?.ok === false) results.push({ id, ok: false, error: data.status });
          else results.push({ id, ok: true });
        } catch (e) {
          results.push({ id, ok: false, error: (e as Error).message });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      if (failCount === 0) toast.success(`Approved ${okCount} suggestions`);
      else toast.warning(`Approved ${okCount}, ${failCount} failed`);
      invalidateAll(qc, orgId);
    },
    onError: (err: Error) => toast.error(`Batch approve failed: ${err.message}`),
  });

  return {
    suggestions: list.data ?? [],
    isLoading: list.isLoading,
    isError: list.isError,
    error: list.error,
    approve: approve.mutateAsync,
    reject: reject.mutateAsync,
    batchApprove: batchApprove.mutateAsync,
    isApproving: approve.isPending,
    isRejecting: reject.isPending,
  };
}

// Lightweight pending-count subscription for the sidebar badge. Lives in a
// separate query key so it stays warm even while the inbox is filtered.
export function useAgentPendingCount() {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  return useQuery<number>({
    queryKey: [KEY_PENDING_COUNT, orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await sb
        .from('agent_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
    // Cheap query — let it refetch every 30s so the badge stays roughly fresh
    // without realtime.
    refetchInterval: 30_000,
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>, orgId?: string) {
  qc.invalidateQueries({ queryKey: ['agent_suggestions'] });
  if (orgId) qc.invalidateQueries({ queryKey: [KEY_PENDING_COUNT, orgId] });
}
