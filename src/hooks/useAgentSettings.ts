// useAgentSettings — the org's meeting-agent settings row (enabled, model,
// confidence threshold, cost cap). Read-only here: the inbox only needs to
// know whether the agent is on. In production, writes go through an edge
// function that re-validates with the same rules as
// src/lib/schemas/agentSettings.ts.

import { useQuery } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';
import type { AgentSettings } from '@/types/agent';

export interface AgentSettingsExtended extends AgentSettings {
  monthly_cost_cap_usd: number;
  cost_capped_at: string | null;
}

export function useAgentSettings() {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;

  return useQuery<AgentSettingsExtended | null>({
    queryKey: ['agent_settings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await db
        .from('agent_settings')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return (data as AgentSettingsExtended | null) ?? null;
    },
  });
}
