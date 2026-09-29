import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useAuth } from '@/contexts/AuthContext';

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  organization_id: string | null;
}

export function useProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const queryKey = ['profile', userId] as const;

  const { data: profile = null, isLoading, refetch } = useQuery({
    queryKey,
    enabled: !!userId,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await db
        .from('profiles')
        .select('id, user_id, display_name, avatar_url, organization_id')
        .eq('user_id', userId!)
        .maybeSingle();
      return (data as Profile | null) ?? null;
    },
  });

  const updateProfile = async (updates: { display_name?: string; avatar_url?: string }) => {
    if (!userId) return;
    const { error } = await db
      .from('profiles')
      .update(updates)
      .eq('user_id', userId);
    if (!error) {
      qc.setQueryData<Profile | null>(queryKey as any, (prev) =>
        prev ? { ...prev, ...updates } : prev
      );
    }
    return error;
  };

  return { profile, loading: !!userId && isLoading, updateProfile, refetch };
}
