import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useOrgContext, orgQueryLoading } from '@/hooks/useOrgContext';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database';

export type DbContact = Tables<'contacts'>;
export type DbContactInsert = TablesInsert<'contacts'>;

export function useContactsDB(accountId?: string) {
  const orgCtx = useOrgContext();
  const orgId = orgCtx.orgId ?? undefined;
  const qc = useQueryClient();
  const key = ['contacts', orgId, accountId ?? null] as const;

  const { data: contacts = [], isLoading, refetch } = useQuery({
    queryKey: key,
    enabled: !!orgId,
    queryFn: async () => {
      let q = db.from('contacts').select('*').eq('organization_id', orgId!);
      if (accountId) q = q.eq('account_id', accountId);
      const { data } = await q.order('created_at', { ascending: false });
      return (data || []) as DbContact[];
    },
  });

  const addContact = useCallback(async (contact: Omit<DbContactInsert, 'organization_id'>) => {
    if (!orgId) return null;
    const { data, error } = await db
      .from('contacts')
      .insert({ ...contact, organization_id: orgId })
      .select()
      .single();
    if (!error && data) {
      qc.setQueryData<DbContact[]>(key as any, (prev = []) => [data as DbContact, ...prev]);
      qc.invalidateQueries({ queryKey: ['contacts', orgId] });
    }
    return { data, error };
  }, [orgId, qc, accountId]);

  const updateContact = useCallback(async (id: string, patch: Partial<DbContact>) => {
    const snapshots: Array<{ key: any; data: DbContact[] | undefined }> = [];
    qc.getQueriesData<DbContact[]>({ queryKey: ['contacts', orgId] }).forEach(([k, data]) => {
      snapshots.push({ key: k, data });
      if (data) qc.setQueryData(k, data.map(c => c.id === id ? { ...c, ...patch } as DbContact : c));
    });
    const { error } = await db.from('contacts').update(patch).eq('id', id);
    if (error) snapshots.forEach(s => qc.setQueryData(s.key, s.data));
    return error;
  }, [orgId, qc]);

  const deleteContact = useCallback(async (id: string) => {
    const { error } = await db.from('contacts').delete().eq('id', id);
    if (!error) {
      qc.getQueriesData<DbContact[]>({ queryKey: ['contacts', orgId] }).forEach(([k, data]) => {
        if (data) qc.setQueryData(k, data.filter(c => c.id !== id));
      });
    }
    return error;
  }, [orgId, qc]);

  return { contacts, loading: orgQueryLoading(orgCtx, { isLoading }), addContact, updateContact, deleteContact, refetch };
}
