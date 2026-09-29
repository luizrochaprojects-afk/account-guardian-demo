import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useOrgContext, orgQueryLoading } from '@/hooks/useOrgContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Tables, TablesInsert } from '@/types/database';

export type DbNote = Tables<'notes'>;

interface NotesFilter {
  accountId?: string;
  projectId?: string;
  taskId?: string;
  contactId?: string;
}

export function useNotesDB(filter?: NotesFilter) {
  const orgCtx = useOrgContext();
  const { user } = useAuth();
  const orgId = orgCtx.orgId ?? undefined;
  const qc = useQueryClient();
  const key = ['notes', orgId, filter?.accountId ?? null, filter?.projectId ?? null, filter?.taskId ?? null, filter?.contactId ?? null] as const;

  const { data: notes = [], isLoading, refetch } = useQuery({
    queryKey: key,
    enabled: !!orgId,
    queryFn: async () => {
      let q = db.from('notes').select('*').eq('organization_id', orgId!);
      if (filter?.accountId) q = q.eq('account_id', filter.accountId);
      if (filter?.projectId) q = q.eq('project_id', filter.projectId);
      if (filter?.taskId) q = q.eq('task_id', filter.taskId);
      if (filter?.contactId) q = q.eq('contact_id', filter.contactId);
      const { data } = await q.order('created_at', { ascending: false });
      return (data || []) as DbNote[];
    },
  });

  const addNote = useCallback(async (note: Omit<TablesInsert<'notes'>, 'organization_id' | 'user_id'>) => {
    if (!orgId || !user) return null;
    const { data, error } = await db
      .from('notes')
      .insert({ ...note, organization_id: orgId, user_id: user.id })
      .select()
      .single();
    if (!error && data) {
      qc.getQueriesData<DbNote[]>({ queryKey: ['notes', orgId] }).forEach(([k, prev]) => {
        if (prev) qc.setQueryData(k, [data as DbNote, ...prev]);
      });
    }
    return { data, error };
  }, [orgId, user, qc]);

  const updateNote = useCallback(async (id: string, patch: Partial<DbNote>) => {
    // Optimistic across all notes caches
    const snapshots: Array<{ key: any; data: DbNote[] | undefined }> = [];
    qc.getQueriesData<DbNote[]>({ queryKey: ['notes', orgId] }).forEach(([k, data]) => {
      snapshots.push({ key: k, data });
      if (data) qc.setQueryData(k, data.map(n => n.id === id ? { ...n, ...patch } as DbNote : n));
    });
    const { error } = await db.from('notes').update(patch).eq('id', id);
    if (error) {
      snapshots.forEach(s => qc.setQueryData(s.key, s.data));
      toast.error('Failed to save note');
    }
    return error;
  }, [orgId, qc]);

  const deleteNote = useCallback(async (id: string) => {
    const { error } = await db.from('notes').delete().eq('id', id);
    if (!error) {
      qc.getQueriesData<DbNote[]>({ queryKey: ['notes', orgId] }).forEach(([k, data]) => {
        if (data) qc.setQueryData(k, data.filter(n => n.id !== id));
      });
    }
    return error;
  }, [orgId, qc]);

  return { notes, loading: orgQueryLoading(orgCtx, { isLoading }), addNote, updateNote, deleteNote, refetch };
}
