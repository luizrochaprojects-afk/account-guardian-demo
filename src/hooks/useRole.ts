import { useQuery } from '@tanstack/react-query';
import { db } from '@/demo/db';

export type ProfileRole = 'founder' | 'member';

export function useRole() {
  const query = useQuery({
    queryKey: ['profile-role'],
    queryFn: async (): Promise<ProfileRole | undefined> => {
      const { data, error } = await db.rpc('get_user_role');
      if (error) return undefined;
      return (data as ProfileRole | null) ?? undefined;
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    role: query.data,
    isFounder: query.data === 'founder',
    isMember: query.data === 'member',
    isLoading: query.isLoading,
    error: query.error,
  };
}
