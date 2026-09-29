import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';

export interface IssueTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  default_status: string | null;
  default_priority: string | null;
  default_assigned_role: string | null;
  default_labels: string[];
  body_template: string | null;
  is_default: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

type InsertPayload = Omit<IssueTemplate, 'id' | 'organization_id' | 'created_at' | 'updated_at'>;

export function useIssueTemplatesDB() {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();
  const key = ['issue_templates', orgId] as const;

  const { data: templates = [], isLoading: loading, refetch } = useQuery({
    queryKey: key,
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await db
        .from('issue_templates')
        .select('*')
        .eq('organization_id', orgId!)
        .order('position', { ascending: true });
      return ((data as IssueTemplate[]) || []);
    },
  });

  const addTemplate = useCallback(async (payload: InsertPayload) => {
    if (!orgId) return null;
    if (payload.is_default) {
      await db.from('issue_templates').update({ is_default: false } as any).eq('organization_id', orgId).eq('is_default', true);
    }
    const { data, error } = await db
      .from('issue_templates')
      .insert({ ...payload, organization_id: orgId } as any)
      .select()
      .single();
    if (!error && data) await refetch();
    return { data: data as IssueTemplate | null, error };
  }, [orgId, refetch]);

  const updateTemplate = useCallback(async (id: string, patch: Partial<InsertPayload>) => {
    if (!orgId) return;
    if (patch.is_default) {
      await db.from('issue_templates').update({ is_default: false } as any).eq('organization_id', orgId).eq('is_default', true);
    }
    await db.from('issue_templates').update(patch as any).eq('id', id);
    await refetch();
  }, [orgId, refetch]);

  const deleteTemplate = useCallback(async (id: string) => {
    await db.from('issue_templates').delete().eq('id', id);
    qc.setQueryData<IssueTemplate[]>(key as any, (prev = []) => prev.filter(t => t.id !== id));
  }, [qc]);

  const getDefault = useCallback(() => templates.find(t => t.is_default) || null, [templates]);

  return { templates, loading, addTemplate, updateTemplate, deleteTemplate, getDefault, refetch };
}
