import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NorthStarCard } from '@/components/dashboard/NorthStarCard';
import { HygieneCountersBoard } from '@/components/dashboard/pipeline/HygieneCountersBoard';
import { CustomerBlock } from '@/components/dashboard/CustomerBlock';
import { LossReasonsCard } from '@/components/dashboard/pipeline/LossReasonsCard';
import { SalesFunnel } from '@/components/dashboard/pipeline/SalesFunnel';
import AccountsMoneyView from '@/components/accounts/AccountsMoneyView';
import { useAccounts } from '@/contexts/AccountsContext';
import {
  useNorthStarCounts,
  useLossReasons,
} from '@/hooks/useDashboardMetrics';
import { useSalesFunnel } from '@/hooks/useSalesFunnel';
import { buildFunnelSteps } from '@/lib/salesFunnel';

export interface PipelineTabProps {
  since: Date;
  onError: (error: unknown) => void;
}

/**
 * Where each deal stands and why deals are lost — the dashboard's landing tab. The hygiene board leads it: the only
 * element here that asks for an action rather than describing the past.
 *
 * One funnel element (SalesFunnel), FLOW semantics: per spine step, the cohort
 * that ENTERED it inside the window, its money, conversion to the next step
 * and median days to get there. The compact card row above it holds the
 * non-funnel headlines only.
 */
export function PipelineTab({ since, onError }: PipelineTabProps) {
  const { accounts } = useAccounts();
  const { data: northStar, isLoading: nsLoading, error: nsError } = useNorthStarCounts(since);
  const { data: lossReasons, isLoading: lossLoading, error: lossError } = useLossReasons(since);

  // Off by default: the honest reading of a window is what happened in it. The
  // switch lives on the funnel card, which is the only element it changes.
  const [includeLegacy, setIncludeLegacy] = useState(false);
  const funnel = useSalesFunnel(since, includeLegacy);

  const error = nsError ?? lossError ?? funnel.error;
  useEffect(() => {
    if (error) onError(error);
  }, [error, onError]);

  const funnelSteps = useMemo(() => buildFunnelSteps(funnel.data), [funnel.data]);

  return (
    <div className="flex flex-col gap-6">
      {/* The daily ritual leads the landing tab: every counter targets zero and
          each one implies an action, so it sits above the analytics that only
          describe. Self-fetching — no props, and it shares its query with
          AccountsMoneyView below. */}
      <div data-tour="hygiene">
        <HygieneCountersBoard />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <NorthStarCard
          title="Accounts worked"
          primaryValue={northStar?.accounts_worked ?? 0}
          isLoading={nsLoading}
        />
        {/* STOCK, not flow — the only card in this row that ignores the period,
            and a narrower population than the funnel's won step (phase =
            customer excludes pilot_running / pilot_review / adoption). Both
            facts are in the caption because three "customer" counts on one
            screen is what started this audit. */}
        <NorthStarCard
          title="Active customers"
          primaryValue={northStar?.active_customer_count ?? 0}
          secondaryValue="today, not this period"
          isLoading={nsLoading}
        />
        <NorthStarCard
          title="Entered discovery"
          primaryValue={(northStar?.working_count ?? 0) + (northStar?.discovery_call_count ?? 0)}
          secondaryValue="working or meeting booked"
          isLoading={nsLoading}
        />
        <NorthStarCard
          title="Qualified or in sign-off"
          primaryValue={(northStar?.qualified_opp_count ?? 0) + (northStar?.signoff_count ?? 0)}
          secondaryValue="entered in this period"
          isLoading={nsLoading}
        />
      </div>

      <SalesFunnel
        steps={funnelSteps}
        isLoading={funnel.isLoading}
        includeLegacy={includeLegacy}
        onIncludeLegacyChange={setIncludeLegacy}
      />

      {/* "Near the money": the editable deal list, moved here from
          /accounts?view=money. A snapshot, not windowed by `since`: it lists
          what is near the money NOW. */}
      <Card>
        <CardHeader className="p-4 pb-2 flex-row items-baseline justify-between space-y-0">
          <CardTitle className="text-base font-semibold">Near the money</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <AccountsMoneyView accounts={accounts} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LossReasonsCard data={lossReasons} isLoading={lossLoading} />
        {/* The Customer phase's own row. Deliberately outside SalesFunnel
            above: that element models the sales spine as a funnel, and the
            Customer phase is a priority ladder accounts re-enter, not a funnel. */}
        <CustomerBlock />
      </div>
    </div>
  );
}
