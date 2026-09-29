// CustomerPhaseHeader — the Customer phase's answer to "Potential ARR".
//
// The other three phases head their board with Σ arr, which answers "how big
// could this get?". That question dies the moment the deal closes: for a live
// customer, potential ARR is a number derived from an MRR someone typed during
// a negotiation that already ended. This header replaces it with what the
// accounts are actually doing — usage, retention, who went quiet.
//
// All arithmetic lives in src/lib/customerPortfolio.ts and is unit-tested there.
// This file only renders. If you find yourself computing a ratio here, it
// belongs upstream.

import { useMemo } from 'react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRole } from '@/hooks/useRole';
import { useCustomerSignals } from '@/hooks/useCustomerSignals';
import {
  summarizeCustomerPortfolio,
  compactAmount,
  formatRatio,
} from '@/lib/customerPortfolio';
import { cn } from '@/lib/utils';

interface Props {
  /** Clicking the dormant alert filters the board down to those accounts. */
  onFilterDormant?: () => void;
}

/** One metric. `hint` is the tooltip; `sub` is the always-visible second line. */
function Metric({
  label,
  value,
  sub,
  hint,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  tone?: 'neutral' | 'warning';
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          'text-sm font-semibold tabular-nums',
          tone === 'warning' && 'text-destructive',
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground tabular-nums">{sub}</div>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={hint}
        className="text-left rounded-md px-2 py-1 -mx-2 hover:bg-muted transition-colors"
      >
        {body}
      </button>
    );
  }
  return (
    <div title={hint} className="px-2 py-1 -mx-2">
      {body}
    </div>
  );
}

export function CustomerPhaseHeader({ onFilterDormant }: Props) {
  const { rows, thresholds, loading, reclassify } = useCustomerSignals();
  const { isFounder } = useRole();

  const summary = useMemo(
    () => summarizeCustomerPortfolio(rows, thresholds),
    [rows, thresholds],
  );

  const onReclassify = async () => {
    const { moved, error } = await reclassify();
    if (error) {
      toast.error('Reclassify failed — see console');
      return;
    }
    toast.success(
      moved === 0
        ? 'Nothing to reclassify — every account is already where the signals put it'
        : `Reclassified ${moved} account${moved === 1 ? '' : 's'}`,
    );
  };

  if (loading) {
    return <span className="text-sm text-muted-foreground">Loading signals…</span>;
  }

  if (rows.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        No usage signals yet
      </span>
    );
  }

  const deltaPct = summary.usageDeltaPct;

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <Metric
        label="Active"
        value={`${summary.activeCustomers}`}
        sub={
          summary.withoutFreshSignals > 0
            ? `${summary.withoutFreshSignals} without fresh data`
            : undefined
        }
        hint="Live customers — churned excluded."
      />

      <Metric
        label="Usage 4w"
        value={compactAmount(summary.usage4w)}
        // Arrow AND sign AND number: status is never carried by colour alone.
        sub={
          deltaPct === null
            ? '— vs. prior 4w'
            : `${deltaPct > 0 ? '▲ +' : deltaPct < 0 ? '▼ ' : ''}${Math.round(deltaPct * 100)}% vs. prior 4w`
        }
        hint="Σ product usage across live customers, trailing 4 complete weeks."
      />

      {/* NRR and GRR always show their work. A retention number without its
          denominator is unauditable, and this one has a denominator people
          argue about — see the module header in customerPortfolio.ts. */}
      <Metric
        label="Net usage retention"
        value={formatRatio(summary.nrr)}
        sub={`${summary.nrr.sampleSize} account${summary.nrr.sampleSize === 1 ? '' : 's'} in the prior window`}
        hint="Denominator counts only accounts that used the product in the previous window — including new logos would make this a growth metric wearing a retention metric's name."
      />

      <Metric
        label="Gross usage retention"
        value={formatRatio(summary.grr)}
        hint="Same cohort, but no account may contribute more than it did before — capped per account, not on the total."
      />

      {summary.dormant > 0 && (
        <Metric
          label="Dormant"
          value={`${summary.dormant}`}
          sub={`no usage for ${thresholds.dormantWeeks}+ weeks`}
          tone="warning"
          hint="Customers that stopped using the product. Click to filter the board."
          onClick={onFilterDormant}
        />
      )}

      {/* The nightly job is the normal path. This is for the minute after
          something changes and someone wants the board to catch up. */}
      {isFounder && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReclassify}
          className="h-7 px-2 text-xs text-muted-foreground shrink-0"
          title="Re-run the classifier for this org now, instead of waiting for the nightly job."
        >
          <RefreshCw className="h-3 w-3 mr-1" /> Reclassify
        </Button>
      )}
    </div>
  );
}
