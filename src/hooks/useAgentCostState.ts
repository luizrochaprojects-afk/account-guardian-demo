// useAgentCostState — read-only telemetry for the per-org monthly LLM spend
// ceiling. Sourced from the `agent_cost_state` view, which is a thin wrapper
// over `agent_settings` + `agent_current_month_spend_usd(org_id)`.
//
// Shape returned to the UI:
//   capped     — true when current spend has reached or exceeded the cap
//                (or when cap === 0, which means "polling disabled")
//   spend_usd  — current month spend in USD (sum of meeting_ingests token_used
//                blended at ~$4/Mtok)
//   cap_usd    — configured monthly cap in USD
//   percent    — spend_usd / cap_usd * 100, 0..(>100) — used for the progress bar
//
import { useQuery } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';

export interface AgentCostState {
  capped: boolean;
  spend_usd: number;
  cap_usd: number;
  percent: number;
  cost_capped_at: string | null;
}

export function useAgentCostState() {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;

  return useQuery<AgentCostState | undefined>({
    queryKey: ['agent_cost_state', orgId],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('agent_cost_state')
        .select('monthly_cost_cap_usd, cost_capped_at, current_month_spend_usd, percent_of_cap')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return undefined;
      const cap = Number(data.monthly_cost_cap_usd ?? 0);
      const spend = Number(data.current_month_spend_usd ?? 0);
      // cap === 0 is an explicit "paused" state. Mirror the server-side
      // cost-guard logic here so the UI sees the same truthy `capped` value
      // the server does.
      const capped = cap === 0 ? true : spend >= cap;
      const percent = cap > 0 ? (spend / cap) * 100 : 0;
      return {
        capped,
        spend_usd: spend,
        cap_usd: cap,
        percent,
        cost_capped_at: data.cost_capped_at ?? null,
      };
    },
  });
}
