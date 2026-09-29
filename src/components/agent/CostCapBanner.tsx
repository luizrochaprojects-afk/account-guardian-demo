// CostCapBanner — inline notice shown in the inbox view when the org has hit
// its monthly LLM cost cap. The agent extraction pipeline pauses in this
// state (the cost guard short-circuits extraction and the meeting poller skips
// capped orgs), so without a banner the inbox would silently stop receiving
// new suggestions.
//
// The banner only renders when `useAgentCostState().data.capped === true`.
// When the cap is just $0 (paused), we still render — both are intentional
// "polling halted" states the founder needs to see.

import { AlertTriangle } from 'lucide-react';
import { useAgentCostState } from '@/hooks/useAgentCostState';

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CostCapBanner() {
  const { data } = useAgentCostState();
  if (!data || !data.capped) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm flex items-center gap-2"
    >
      <AlertTriangle className="h-4 w-4 text-red-700 shrink-0" />
      <span className="flex-1 text-red-900">
        Agent polling paused — monthly LLM cost cap reached ({formatUsd(data.spend_usd)} /{' '}
        {formatUsd(data.cap_usd)}). Increase the cap in the agent settings to resume.
      </span>
    </div>
  );
}
