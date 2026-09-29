import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables, TablesInsert } from '@/types/database';

export type DbEvent = Tables<'events'>;
export type DbEventContact = Tables<'event_contacts'>;

export type EventWithContacts = DbEvent & {
  contact_ids: string[];
};

export function useEventsDB(accountId?: string) {
  const { profile } = useProfile();
  const { user } = useAuth();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();
  const key = ['events', orgId, accountId ?? null] as const;

  const { data: events = [], isLoading: loading, refetch } = useQuery({
    queryKey: key,
    enabled: !!orgId,
    queryFn: async () => {
      // Explicit columns — drop `summary` (large free-text) from list payload.
      let q = db
        .from('events')
        .select('id,organization_id,account_id,user_id,title,type,channel,direction,sentiment,group_label,date,time,scheduled_at,completed_at,created_at,event_contacts(contact_id)')
        .eq('organization_id', orgId!);
      if (accountId) q = q.eq('account_id', accountId);
      const { data } = await q.order('scheduled_at', { ascending: false, nullsFirst: false }).order('date', { ascending: false });
      return ((data || []) as any[]).map((e: any) => ({
        ...e,
        contact_ids: (e.event_contacts || []).map((ec: any) => ec.contact_id),
      })) as EventWithContacts[];
    },
  });

  const updateAllCaches = (updater: (prev: EventWithContacts[]) => EventWithContacts[]) => {
    qc.getQueriesData<EventWithContacts[]>({ queryKey: ['events', orgId] }).forEach(([k, data]) => {
      if (data) qc.setQueryData(k, updater(data));
    });
  };

  const addEvent = useCallback(async (
    event: Omit<TablesInsert<'events'>, 'organization_id' | 'user_id'>,
    contactIds: string[] = [],
  ) => {
    if (!orgId || !user) return null;
    const { data, error } = await db
      .from('events')
      .insert({ ...event, organization_id: orgId, user_id: user.id })
      .select()
      .single();
    if (error || !data) return { data: null, error };
    if (contactIds.length > 0) {
      await db.from('event_contacts').insert(
        contactIds.map(cid => ({ event_id: data.id, contact_id: cid, organization_id: orgId }))
      );
    }
    updateAllCaches(prev => [{ ...data, contact_ids: contactIds }, ...prev]);
    return { data, error: null };
  }, [orgId, user, qc]);

  const updateEvent = useCallback(async (id: string, patch: Partial<DbEvent>, contactIds?: string[]) => {
    const { error } = await db.from('events').update(patch).eq('id', id);
    if (error) return error;
    if (contactIds && orgId) {
      await db.from('event_contacts').delete().eq('event_id', id);
      if (contactIds.length > 0) {
        await db.from('event_contacts').insert(
          contactIds.map(cid => ({ event_id: id, contact_id: cid, organization_id: orgId }))
        );
      }
    }
    updateAllCaches(prev => prev.map(e => e.id === id
      ? { ...e, ...patch, contact_ids: contactIds ?? e.contact_ids } as EventWithContacts
      : e
    ));
    return null;
  }, [orgId, qc]);

  const deleteEvent = useCallback(async (id: string) => {
    const { error } = await db.from('events').delete().eq('id', id);
    if (!error) updateAllCaches(prev => prev.filter(e => e.id !== id));
    return error;
  }, [orgId, qc]);

  const completeEvent = useCallback(async (id: string) => {
    return updateEvent(id, { completed_at: new Date().toISOString() } as any);
  }, [updateEvent]);

  return { events, loading, addEvent, updateEvent, deleteEvent, completeEvent, refetch };
}
