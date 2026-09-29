// CustomerBlock — the Customer phase's row on /dashboard.
//
// Answers the weekly-review questions the board answers daily: who broke this
// week, how the portfolio is distributed across the five columns, which
// accounts are shrinking fastest, and why customers left.
//
// Churn reasons are reported here and NOT folded into `dashboard_loss_reasons`.
// That RPC aggregates Sales losses — "did not buy". Churn is "bought, then
// left". Averaging the two produces a chart that recommends nothing.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomerSignals } from '@/hooks/useCustomerSignals';
import { useAccounts } from '@/contexts/AccountsContext';
import {
  enteredRiskSince,
  topUsageDrops,
  compactAmount,
} from '@/lib/customerPortfolio';
import { stageLabel, customerRiskReasonLabel, CHURN_REASON_LABELS } from '@/lib/pipelineStages';
import type { PipelineStage } from '@/lib/transitionStage';

const CUSTOMER_STAGES: PipelineStage[] = [
  'ramping',
  'steady',
  'expanding',
  'at_risk',
  'churned',
] as PipelineStage[];

const CHURN_LOOKBACK_DAYS = 90;
const RISK_WINDOW_DAYS = 7;

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-subtle p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function CustomerBlock() {
  const { rows, loading } = useCustomerSignals();
  const { accounts } = useAccounts();

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const stageChangedAt = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.stage_changed_at])),
    [accounts],
  );

  const stats = useMemo(() => {
    const now = Date.now();
    const distribution = CUSTOMER_STAGES.map((s) => ({
      stage: s,
      count: rows.filter((r) => r.pipelineStage === s).length,
    }));

    // Churn reasons come off the account row (human-declared), not the signals
    // view — the classifier never writes churn.
    const churnCutoff = now - CHURN_LOOKBACK_DAYS * 86_400_000;
    const churnReasons = new Map<string, number>();
    for (const r of rows) {
      if (r.pipelineStage !== 'churned') continue;
      const acct = accountById.get(r.accountId);
      const at = stageChangedAt.get(r.accountId);
      if (!acct?.churn_reason) continue;
      if (at && new Date(at).getTime() < churnCutoff) continue;
      churnReasons.set(acct.churn_reason, (churnReasons.get(acct.churn_reason) ?? 0) + 1);
    }

    return {
      distribution,
      enteredRisk: enteredRiskSince(rows, stageChangedAt, RISK_WINDOW_DAYS, now).length,
      atRiskTotal: rows.filter((r) => r.pipelineStage === 'at_risk').length,
      drops: topUsageDrops(rows, 5),
      churnReasons: [...churnReasons.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [rows, accountById, stageChangedAt]);

  return (
    <Card className="h-full">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base font-semibold">Customer</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accounts in the Customer phase yet.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Tile
                label={`Entered At Risk (${RISK_WINDOW_DAYS}d)`}
                value={`${stats.enteredRisk}`}
              />
              <Tile label="At Risk now" value={`${stats.atRiskTotal}`} />
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Distribution</div>
              <dl className="space-y-1 text-sm">
                {stats.distribution.map(({ stage, count }) => (
                  <div key={stage} className="flex items-center justify-between">
                    <dt className="text-muted-foreground">{stageLabel(stage)}</dt>
                    <dd className="font-mono tabular-nums">{count}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {stats.drops.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">
                  Biggest usage drops
                </div>
                <ul className="space-y-1 text-sm">
                  {stats.drops.map((d) => (
                    <li key={d.accountId} className="flex items-center justify-between gap-2">
                      <Link
                        to={`/account/${d.accountId}`}
                        className="truncate hover:underline"
                      >
                        {accountById.get(d.accountId)?.name ?? d.accountId}
                      </Link>
                      <span className="font-mono tabular-nums text-destructive shrink-0">
                        ▼ {Math.round((d.usageDeltaPct ?? 0) * 100)}%
                        <span className="text-muted-foreground ml-1.5">
                          {compactAmount(d.usage4w)} / 4w
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {stats.churnReasons.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">
                  Churn reasons ({CHURN_LOOKBACK_DAYS}d)
                </div>
                <dl className="space-y-1 text-sm">
                  {stats.churnReasons.map(([reason, count]) => (
                    <div key={reason} className="flex items-center justify-between">
                      <dt className="text-muted-foreground truncate">
                        {CHURN_REASON_LABELS[reason] ?? reason}
                      </dt>
                      <dd className="font-mono tabular-nums">{count}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {stats.atRiskTotal > 0 && stats.drops.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {customerRiskReasonLabel(
                  rows.find((r) => r.pipelineStage === 'at_risk')?.customerRiskReason,
                )}{' '}
                is the leading risk — no usage drops recorded.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
