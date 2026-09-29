import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';

export type RelationType = 'related' | 'blocks' | 'duplicate';

export interface TaskRelation {
  id: string;
  organization_id: string;
  source_task_id: string;
  target_task_id: string;
  relation_type: RelationType;
  created_at: string;
}

export interface ResolvedRelation extends TaskRelation {
  related_task_id: string; // the "other" task id from this task's perspective
  related_task_name: string;
  related_task_status: string;
  direction: 'source' | 'target'; // 'source' = this task is the source
}

export function useTaskRelationsDB(taskId?: string) {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();
  const key = ['task_relations', taskId, orgId] as const;

  const { data: relations = [], isLoading: loading, refetch } = useQuery({
    queryKey: key,
    enabled: !!(taskId && orgId),
    queryFn: async () => {
      const [{ data: asSource }, { data: asTarget }] = await Promise.all([
        db.from('task_relations').select('*').eq('source_task_id', taskId!).eq('organization_id', orgId!),
        db.from('task_relations').select('*').eq('target_task_id', taskId!).eq('organization_id', orgId!),
      ]);
      const allRaw = [
        ...(asSource || []).map(r => ({ ...r, direction: 'source' as const, related_task_id: r.target_task_id })),
        ...(asTarget || []).map(r => ({ ...r, direction: 'target' as const, related_task_id: r.source_task_id })),
      ];
      if (allRaw.length === 0) return [] as ResolvedRelation[];
      const ids = [...new Set(allRaw.map(r => r.related_task_id))];
      const { data: tasks } = await db.from('tasks').select('id, name, status').in('id', ids);
      const taskMap = Object.fromEntries((tasks || []).map(t => [t.id, t]));
      return allRaw.map(r => ({
        ...r,
        relation_type: r.relation_type as RelationType,
        related_task_name: taskMap[r.related_task_id]?.name || 'Unknown',
        related_task_status: taskMap[r.related_task_id]?.status || 'todo',
      })) as ResolvedRelation[];
    },
  });

  const addRelation = async (sourceId: string, targetId: string, type: RelationType) => {
    if (!orgId) return;
    const { error } = await db.from('task_relations').insert({
      organization_id: orgId,
      source_task_id: sourceId,
      target_task_id: targetId,
      relation_type: type,
    });
    if (!error) await refetch();
    return { error };
  };

  const removeRelation = async (id: string) => {
    await db.from('task_relations').delete().eq('id', id);
    await refetch();
  };

  // Derived lists
  const blocks = relations.filter(r => r.relation_type === 'blocks' && r.direction === 'source');
  const blockedBy = relations.filter(r => r.relation_type === 'blocks' && r.direction === 'target');
  const related = relations.filter(r => r.relation_type === 'related');
  const duplicateOf = relations.filter(r => r.relation_type === 'duplicate' && r.direction === 'source');
  const duplicatedBy = relations.filter(r => r.relation_type === 'duplicate' && r.direction === 'target');

  return { relations, loading, addRelation, removeRelation, blocks, blockedBy, related, duplicateOf, duplicatedBy, refetch };
}

// Bulk hook: fetch all relations for org (for list indicators)
export function useAllTaskRelations() {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const { data: relations = [], refetch } = useQuery({
    queryKey: ['task_relations_all', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await db.from('task_relations').select('*').eq('organization_id', orgId!);
      return (data || []) as TaskRelation[];
    },
  });

  // Quick lookup sets
  const blockedTaskIds = new Set(relations.filter(r => r.relation_type === 'blocks').map(r => r.target_task_id));
  const blockingTaskIds = new Set(relations.filter(r => r.relation_type === 'blocks').map(r => r.source_task_id));

  return { relations, blockedTaskIds, blockingTaskIds, refetch };
}
