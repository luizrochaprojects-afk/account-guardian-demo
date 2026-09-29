// useDealCoverage — reads the account_deal_coverage view (Phase 2) for the org
// and exposes a per-account map + a contact role/engagement mutation.

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';
import type { DealRole, DealEngagement } from '@/lib/dealCoverage';

export interface AccountCoverage {
  account_id: string;
  pipeline_phase: string | null;
  pipeline_stage: string | null;
  engaged_contacts_count: number;
  champion_engaged: boolean;
  decision_maker_engaged: boolean;
  multi_threaded: boolean;
}

const toNumber = (v: unknown): number => (typeof v === 'string' ? Number(v) : (v as number)) || 0;

export function useDealCoverage() {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['deal-coverage', orgId] as const,
    enabled: !!orgId,
    queryFn: async (): Promise<AccountCoverage[]> => {
      const { data, error } = await db
        .from('account_deal_coverage')
        .select('account_id, pipeline_phase, pipeline_stage, engaged_contacts_count, champion_engaged, decision_maker_engaged, multi_threaded')
        .eq('organization_id', orgId!);
      if (error) throw error;
      return (data ?? [])
        .filter((r) => r.account_id)
        .map((r) => ({
          account_id: r.account_id as string,
          pipeline_phase: r.pipeline_phase,
          pipeline_stage: r.pipeline_stage,
          engaged_contacts_count: toNumber(r.engaged_contacts_count),
          champion_engaged: !!r.champion_engaged,
          decision_maker_engaged: !!r.decision_maker_engaged,
          multi_threaded: !!r.multi_threaded,
        }));
    },
  });

  const rows = query.data ?? [];
  const byAccount = new Map(rows.map((r) => [r.account_id, r]));

  const setContactCoverage = useCallback(
    async (contactId: string, patch: { role_in_deal?: DealRole; deal_engagement?: DealEngagement }) => {
      const { error } = await db.from('contacts').update(patch).eq('id', contactId);
      if (!error) {
        qc.invalidateQueries({ queryKey: ['deal-coverage', orgId] });
        qc.invalidateQueries({ queryKey: ['contacts'] });
      }
      return { error };
    },
    [qc, orgId],
  );

  return { rows, byAccount, loading: query.isLoading, setContactCoverage };
}
