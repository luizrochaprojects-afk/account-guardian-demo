import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';
import { useOrgContext, orgQueryLoading } from '@/hooks/useOrgContext';

export interface CustomerRequest {
  id: string;
  organization_id: string;
  account_id: string;
  task_id: string | null;
  project_id: string | null;
  title: string;
  body: string;
  is_important: boolean;
  contact_name: string | null;
  source: string;
  focus: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type RequestFocus = 'acquisition' | 'retention' | 'monetization';

interface UseCustomerRequestsDBOptions {
  accountId?: string;
  taskId?: string;
}

export function useCustomerRequestsDB(opts: UseCustomerRequestsDBOptions = {}) {
  const { profile } = useProfile();
  const orgCtx = useOrgContext();
  const orgId = orgCtx.orgId ?? undefined;
  const qc = useQueryClient();
  const key = ['customer_requests', orgId, opts.accountId ?? null, opts.taskId ?? null] as const;

  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: key,
    enabled: !!orgId,
    queryFn: async () => {
      let query = db
        .from('customer_requests')
        .select('id,organization_id,account_id,task_id,project_id,title,body,is_important,contact_name,source,focus,created_by,created_at,updated_at')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false });
      if (opts.accountId) query = query.eq('account_id', opts.accountId);
      if (opts.taskId) query = query.eq('task_id', opts.taskId);
      const { data } = await query;
      return (data as CustomerRequest[]) || [];
    },
  });

  const updateAllCaches = (updater: (prev: CustomerRequest[]) => CustomerRequest[]) => {
    qc.getQueriesData<CustomerRequest[]>({ queryKey: ['customer_requests', orgId] }).forEach(([k, data]) => {
      if (data) qc.setQueryData(k, updater(data));
    });
  };

  const addRequest = useCallback(async (input: {
    account_id: string;
    title: string;
    body?: string;
    task_id?: string | null;
    project_id?: string | null;
    contact_name?: string | null;
    source?: string;
    is_important?: boolean;
    focus?: string[];
  }) => {
    if (!orgId || !profile) return null;
    const { data, error } = await db
      .from('customer_requests')
      .insert({
        organization_id: orgId,
        account_id: input.account_id,
        title: input.title,
        body: input.body || '',
        task_id: input.task_id || null,
        project_id: input.project_id || null,
        contact_name: input.contact_name || null,
        source: input.source || 'manual',
        is_important: input.is_important || false,
        focus: input.focus || [],
        created_by: profile.user_id,
      })
      .select()
      .single();
    if (!error && data) updateAllCaches(prev => [data as CustomerRequest, ...prev]);
    return { data: data as CustomerRequest | null, error };
  }, [orgId, profile, qc]);

  const updateRequest = useCallback(async (id: string, patch: Partial<Pick<CustomerRequest, 'title' | 'body' | 'is_important' | 'contact_name' | 'task_id' | 'project_id' | 'focus'>>) => {
    const { error } = await db.from('customer_requests').update(patch).eq('id', id);
    if (!error) updateAllCaches(prev => prev.map(r => r.id === id ? { ...r, ...patch, updated_at: new Date().toISOString() } as CustomerRequest : r));
    return error;
  }, [orgId, qc]);

  const deleteRequest = useCallback(async (id: string) => {
    const { error } = await db.from('customer_requests').delete().eq('id', id);
    if (!error) updateAllCaches(prev => prev.filter(r => r.id !== id));
    return error;
  }, [orgId, qc]);

  const toggleImportant = useCallback(async (id: string) => {
    const req = requests.find(r => r.id === id);
    if (!req) return;
    return updateRequest(id, { is_important: !req.is_important });
  }, [requests, updateRequest]);

  return { requests, loading: orgQueryLoading(orgCtx, { isLoading }), addRequest, updateRequest, deleteRequest, toggleImportant, refetch };
}
