import { useQuery } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';

export interface OrgMember {
  user_id: string;
  display_name: string | null;
}

/**
 * Org members for resolving/assigning an owner. One hook so CompanyInfoPanel,
 * SalesMotionTab, AccountWorkTab and the account page's "Now" block share the
 * same query and shape instead of re-implementing it ad hoc.
 */
export function useOrgMembers() {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;

  const { data: members = [] } = useQuery({
    queryKey: ['org_members', orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('profiles')
        .select('user_id, display_name')
        .eq('organization_id', orgId!);
      if (error) throw error;
      return (data || []) as OrgMember[];
    },
  });

  return { members };
}
