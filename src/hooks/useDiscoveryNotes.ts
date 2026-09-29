import { useQuery } from '@tanstack/react-query';
import { db } from '@/demo/db';
import type { Database } from '@/types/database';

export type DiscoveryNote = Database['public']['Tables']['discovery_notes']['Row'];

export function useDiscoveryNotes(accountId: string) {
  const query = useQuery({
    queryKey: ['discovery-notes', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<DiscoveryNote[]> => {
      const { data, error } = await db
        .from('discovery_notes')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DiscoveryNote[];
    },
  });
  return {
    notes: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
