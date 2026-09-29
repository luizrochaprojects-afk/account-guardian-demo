// useAgentAuditLog — cursor-paged feed for the inbox's Audit tab and the
// admin viewer (task 6.x). Cursor is created_at desc, since the index
// `agent_audit_log(organization_id, created_at DESC)` is the cheap ordering.

import { useInfiniteQuery } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';
import type { ActorType, AgentAuditLog } from '@/types/agent';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose client at the agent tables' boundary
const sb = db as unknown as { from: (table: string) => any };

const PAGE_SIZE = 50;

export interface AuditFilters {
  actorType?: ActorType | 'all';
  action?: string | 'all';
  accountId?: string;
  meetingIngestId?: string;
  suggestionId?: string;
  from?: string; // ISO created_at lower bound
  to?: string;
}

export function useAgentAuditLog(filters: AuditFilters = {}) {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;

  return useInfiniteQuery<{ rows: AgentAuditLog[]; nextCursor: string | null }>({
    queryKey: [
      'agent_audit_log', orgId,
      filters.actorType ?? 'all',
      filters.action ?? 'all',
      filters.accountId ?? null,
      filters.meetingIngestId ?? null,
      filters.suggestionId ?? null,
      filters.from ?? null, filters.to ?? null,
    ],
    enabled: !!orgId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let q = sb.from('agent_audit_log').select('*').eq('organization_id', orgId);
      if (filters.actorType && filters.actorType !== 'all') q = q.eq('actor_type', filters.actorType);
      if (filters.action && filters.action !== 'all') q = q.eq('action', filters.action);
      if (filters.accountId) q = q.eq('account_id', filters.accountId);
      if (filters.meetingIngestId) q = q.eq('meeting_ingest_id', filters.meetingIngestId);
      if (filters.suggestionId) q = q.eq('suggestion_id', filters.suggestionId);
      if (filters.from) q = q.gte('created_at', filters.from);
      if (filters.to) q = q.lte('created_at', filters.to);
      if (pageParam) q = q.lt('created_at', pageParam);

      const { data, error } = await q
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw error;

      const rows = (data ?? []) as AgentAuditLog[];
      const nextCursor = rows.length === PAGE_SIZE ? rows[rows.length - 1].created_at : null;
      return { rows, nextCursor };
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}
