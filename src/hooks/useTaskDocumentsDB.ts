import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';

export interface TaskDocument {
  id: string;
  task_id: string;
  organization_id: string;
  title: string;
  icon: string;
  icon_color: string;
  content: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useTaskDocumentsDB(taskId?: string) {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();
  const key = ['task_documents', taskId] as const;

  const { data: documents = [], isLoading: loading, refetch } = useQuery({
    queryKey: key,
    enabled: !!(taskId && orgId),
    queryFn: async () => {
      const { data } = await db
        .from('task_documents')
        .select('*')
        .eq('task_id', taskId!)
        .order('created_at', { ascending: false });
      return ((data as TaskDocument[]) || []);
    },
  });

  const setCache = (updater: (prev: TaskDocument[]) => TaskDocument[]) => {
    qc.setQueryData<TaskDocument[]>(key as any, (prev = []) => updater(prev));
  };

  const addDocument = useCallback(async (title: string, icon = '📄', iconColor = '#6B7280') => {
    if (!taskId || !orgId || !profile) return null;
    const { data, error } = await db
      .from('task_documents')
      .insert({
        task_id: taskId,
        organization_id: orgId,
        title,
        icon,
        icon_color: iconColor,
        created_by: profile.user_id,
        updated_by: profile.user_id,
      })
      .select()
      .single();
    if (!error && data) setCache(prev => [data as TaskDocument, ...prev]);
    return { data: data as TaskDocument | null, error };
  }, [taskId, orgId, profile, qc]);

  const updateDocument = useCallback(async (id: string, patch: Partial<Pick<TaskDocument, 'title' | 'icon' | 'icon_color' | 'content'>>) => {
    setCache(prev => prev.map(d => d.id === id ? { ...d, ...patch, updated_at: new Date().toISOString() } as TaskDocument : d));
    const { error } = await db.from('task_documents').update({
      ...patch,
      ...(profile ? { updated_by: profile.user_id } : {}),
    }).eq('id', id);
    if (error) refetch();
    return error;
  }, [profile, qc, refetch]);

  const deleteDocument = useCallback(async (id: string) => {
    const { error } = await db.from('task_documents').delete().eq('id', id);
    if (!error) setCache(prev => prev.filter(d => d.id !== id));
    return error;
  }, [qc]);

  return { documents, loading, addDocument, updateDocument, deleteDocument, refetch };
}
