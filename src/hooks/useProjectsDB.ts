import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useOrgContext, orgQueryLoading } from '@/hooks/useOrgContext';
import type { Tables, TablesInsert } from '@/types/database';

export type DbProject = Tables<'projects'>;
export type DbMilestone = Tables<'milestones'>;
export type DbTask = Tables<'tasks'>;

export function useProjectsDB(accountId?: string) {
  const orgCtx = useOrgContext();
  const orgId = orgCtx.orgId ?? undefined;
  const qc = useQueryClient();
  const key = ['projects', orgId, accountId ?? null] as const;

  const { data: projects = [], isLoading, refetch } = useQuery({
    queryKey: key,
    enabled: !!orgId,
    queryFn: async () => {
      // Explicit columns — drop `description` (large free-text) from list payload.
      let q = db
        .from('projects')
        .select('id,organization_id,account_id,name,code,code_number,status,category,owner,started_at,target_end_at,template_origin,template_origin_id,created_at,updated_at')
        .eq('organization_id', orgId!);
      if (accountId) q = q.eq('account_id', accountId);
      const { data } = await q.order('created_at', { ascending: false });
      return (data || []) as DbProject[];
    },
  });

  // Patch only the cached project queries that could include the affected row.
  // key shape: ['projects', orgId, accountId|null]
  const patchMatchingProjectCaches = (
    matches: (keyAccountId: string | null) => boolean,
    updater: (prev: DbProject[]) => DbProject[],
  ) => {
    qc.setQueriesData<DbProject[]>(
      {
        predicate: (q) => {
          if (q.queryKey[0] !== 'projects') return false;
          if (q.queryKey[1] !== orgId) return false;
          const keyAccountId = (q.queryKey[2] ?? null) as string | null;
          return matches(keyAccountId);
        },
      },
      (data) => (data ? updater(data) : data),
    );
  };

  const addProject = useCallback(async (project: Omit<TablesInsert<'projects'>, 'organization_id'>) => {
    if (!orgId) return null;
    const { data, error } = await db
      .from('projects')
      .insert({ ...project, organization_id: orgId })
      .select()
      .single();
    if (!error && data) {
      const created = data as DbProject;
      patchMatchingProjectCaches(
        (kAcc) => kAcc === null || kAcc === created.account_id,
        (prev) => [created, ...prev],
      );
    }
    return { data, error };
  }, [orgId, qc]);

  const updateProject = useCallback(async (id: string, patch: Partial<DbProject>) => {
    const { error } = await db.from('projects').update(patch).eq('id', id);
    if (!error) {
      // Patch every project cache for this org — the row may live in either the
      // org-wide list or an account-scoped list, but we only mutate items whose
      // id matches, so unrelated caches are unchanged in identity-stable ways.
      patchMatchingProjectCaches(
        () => true,
        (prev) => {
          let touched = false;
          const next = prev.map((p) => {
            if (p.id !== id) return p;
            touched = true;
            return { ...p, ...patch } as DbProject;
          });
          return touched ? next : prev;
        },
      );
    }
    return error;
  }, [orgId, qc]);

  const deleteProject = useCallback(async (id: string) => {
    const { error } = await db.from('projects').delete().eq('id', id);
    if (!error) {
      patchMatchingProjectCaches(
        () => true,
        (prev) => {
          const next = prev.filter((p) => p.id !== id);
          return next.length === prev.length ? prev : next;
        },
      );
    }
    return error;
  }, [orgId, qc]);

  return { projects, loading: orgQueryLoading(orgCtx, { isLoading }), addProject, updateProject, deleteProject, refetch };
}

export function useMilestonesDB(projectId?: string) {
  const qc = useQueryClient();
  const key = ['milestones', projectId ?? null] as const;

  const { data: milestones = [], isLoading: loading, refetch } = useQuery({
    queryKey: key,
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await db
        .from('milestones')
        .select('*')
        .eq('project_id', projectId!)
        .order('position', { ascending: true });
      return (data || []) as DbMilestone[];
    },
  });

  const setCache = (updater: (prev: DbMilestone[]) => DbMilestone[]) => {
    qc.setQueryData<DbMilestone[]>(key as any, (prev = []) => updater(prev));
  };

  const addMilestone = useCallback(async (milestone: TablesInsert<'milestones'>) => {
    const { data, error } = await db.from('milestones').insert(milestone).select().single();
    if (!error && data) setCache(prev => [...prev, data as DbMilestone]);
    return { data, error };
  }, [qc, projectId]);

  const updateMilestone = useCallback(async (id: string, patch: Partial<DbMilestone>) => {
    const { error } = await db.from('milestones').update(patch).eq('id', id);
    if (!error) setCache(prev => prev.map(m => m.id === id ? { ...m, ...patch } as DbMilestone : m));
    return error;
  }, [qc, projectId]);

  const deleteMilestone = useCallback(async (id: string) => {
    const { error } = await db.from('milestones').delete().eq('id', id);
    if (!error) setCache(prev => prev.filter(m => m.id !== id));
    return error;
  }, [qc, projectId]);

  const reorderMilestones = useCallback(async (orderedIds: string[]) => {
    setCache(prev => {
      const map = new Map(prev.map(m => [m.id, m]));
      return orderedIds.map((id, idx) => {
        const m = map.get(id);
        return m ? { ...m, position: idx } : m;
      }).filter(Boolean) as DbMilestone[];
    });
    await Promise.all(orderedIds.map((id, idx) =>
      db.from('milestones').update({ position: idx }).eq('id', id)
    ));
  }, [qc, projectId]);

  return { milestones, loading, addMilestone, updateMilestone, deleteMilestone, reorderMilestones, refetch };
}

export function useTasksDB(
  milestoneId?: string,
  orgId?: string,
  /**
   * `standaloneOnly` restricts the result to tasks with no milestone. It
   * currently has no callers and is a footgun for account-level surfaces: it
   * hides every issue that lives inside a project, which is most of them. The
   * account Overview used it and reported "1 open issue" for an account with
   * 15 (and "No open issues" for one with 30) while the Delivery tab beside it
   * listed them all. Reach for it only when you genuinely mean "issues outside
   * any project", and never for a count the user will read as a total.
   */
  options?: { accountId?: string; standaloneOnly?: boolean },
) {
  const qc = useQueryClient();
  const accountId = options?.accountId;
  const standaloneOnly = options?.standaloneOnly;
  const key = ['tasks', milestoneId ?? null, orgId ?? null, accountId ?? null, standaloneOnly ?? false] as const;
  const enabled = !!(milestoneId || orgId || accountId);

  const { data: tasks = [], isLoading: loading, refetch } = useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => {
      let q = db
        .from('tasks')
        .select('id,organization_id,account_id,milestone_id,parent_id,template_id,name,status,priority,position,due_date,due_label,assigned_role,assign_to,category,tags,blocked_by,blocking,is_done,code,code_number,sla_deadline,sla_started_at,sla_duration_hours,objective,success_criteria,created_at,updated_at');
      if (milestoneId) q = q.eq('milestone_id', milestoneId);
      if (orgId) q = q.eq('organization_id', orgId);
      if (accountId) q = q.eq('account_id', accountId);
      if (standaloneOnly) q = q.is('milestone_id', null);
      const { data } = await q.order('position', { ascending: true }).order('created_at', { ascending: true });
      return (data || []) as DbTask[];
    },
  });

  // Patch only task caches whose filters could include the affected row.
  // key shape: ['tasks', milestoneId|null, orgId|null, accountId|null, standaloneOnly]
  const patchMatchingTaskCaches = (
    matches: (key: { mId: string | null; oId: string | null; aId: string | null; standalone: boolean }) => boolean,
    updater: (prev: DbTask[]) => DbTask[],
  ) => {
    qc.setQueriesData<DbTask[]>(
      {
        predicate: (q) => {
          if (q.queryKey[0] !== 'tasks') return false;
          const [, mId, oId, aId, standalone] = q.queryKey as any[];
          return matches({
            mId: mId ?? null,
            oId: oId ?? null,
            aId: aId ?? null,
            standalone: !!standalone,
          });
        },
      },
      (data) => (data ? updater(data) : data),
    );
  };

  const taskMatchesKey = (
    t: DbTask,
    key: { mId: string | null; oId: string | null; aId: string | null; standalone: boolean },
  ) => {
    if (key.mId && key.mId !== t.milestone_id) return false;
    if (key.oId && key.oId !== t.organization_id) return false;
    if (key.aId && key.aId !== t.account_id) return false;
    if (key.standalone && t.milestone_id !== null) return false;
    return true;
  };

  const addTask = useCallback(async (task: TablesInsert<'tasks'>) => {
    const { data, error } = await db.from('tasks').insert(task).select().single();
    if (!error && data) {
      const created = data as DbTask;
      // Optimistic patch: only caches whose filter matches the new row.
      patchMatchingTaskCaches(
        (key) => taskMatchesKey(created, key),
        (prev) => [...prev, created],
      );
    }
    return { data, error };
  }, [qc]);

  const updateTask = useCallback(async (id: string, patch: Partial<DbTask>) => {
    const { error } = await db.from('tasks').update(patch).eq('id', id);
    if (!error) {
      patchMatchingTaskCaches(
        () => true,
        (prev) => {
          let touched = false;
          const next = prev.map((t) => {
            if (t.id !== id) return t;
            touched = true;
            return { ...t, ...patch } as DbTask;
          });
          return touched ? next : prev;
        },
      );
    }
    return error;
  }, [qc]);

  const deleteTask = useCallback(async (id: string) => {
    const { error } = await db.from('tasks').delete().eq('id', id);
    if (!error) {
      patchMatchingTaskCaches(
        () => true,
        (prev) => {
          const next = prev.filter((t) => t.id !== id);
          return next.length === prev.length ? prev : next;
        },
      );
    }
    return error;
  }, [qc]);

  // Helpers for parent/sub-issue relationships
  const getParentTasks = useCallback(() => tasks.filter(t => !t.parent_id), [tasks]);
  const getSubTasks = useCallback((parentId: string) =>
    tasks.filter(t => t.parent_id === parentId).sort((a, b) => a.position - b.position),
  [tasks]);

  const reorderSubTasks = useCallback(async (parentId: string, orderedIds: string[]) => {
    const orderMap = new Map(orderedIds.map((id, idx) => [id, idx]));
    patchMatchingTaskCaches(
      () => true,
      (prev) => {
        let touched = false;
        const next = prev.map((t) => {
          const newPos = orderMap.get(t.id);
          if (newPos === undefined || t.position === newPos) return t;
          touched = true;
          return { ...t, position: newPos };
        });
        return touched ? next : prev;
      },
    );
    await Promise.all(orderedIds.map((id, idx) =>
      db.from('tasks').update({ position: idx }).eq('id', id)
    ));
  }, [qc]);

  return { tasks, loading, addTask, updateTask, deleteTask, refetch, getParentTasks, getSubTasks, reorderSubTasks };
}
