import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useMoney } from '@/hooks/useMoney';
import { formatRate } from '@/lib/pipelineStages';
import type { FunnelStep } from '@/lib/salesFunnel';

export interface SalesFunnelProps {
  steps: FunnelStep[];
  isLoading?: boolean;
  /** True when the current-state backstop is on — changes what the numbers mean. */
  includeLegacy: boolean;
  onIncludeLegacyChange: (next: boolean) => void;
}

/**
 * The one funnel element on the Pipeline tab: per step, how many deals entered
 * in the window, what they are worth, how many converted to the next step, and
 * how long that took. Replaces the old NorthStar funnel cards + StageBoard +
 * StageConversionBar trio, which showed the same spine three ways.
 *
 * ⚠️ FLOW semantics throughout: "Deals" is the cohort that ENTERED the step
 * inside the window, not what is sitting there now — conversion and days are
 * cohort measures and mixing a stock count into the same row would make it
 * internally inconsistent.
 *
 * "→ Conv" means the account later reached a stage AT OR BEYOND the next one,
 * so skipping a stage is not a loss. The final step is won = first real
 * usage INSIDE THE WINDOW, not closed_won.
 *
 * The "Include legacy accounts" switch is the one thing that changes what the
 * numbers MEAN, so it sits in the header rather than in a footnote. On, every
 * account that is live today is counted as one entered+converted unit in each
 * step with no visible windowed entry: the tail stops being flow and becomes
 * current state. It shipped as an invisible always-on behaviour once
 * and that is precisely how the funnel and the card drifted
 * apart — hence the switch, and hence the caption that changes with it.
 *
 * Rendered as a table with div bars rather than recharts, same as the
 * components it replaces: every bar carries a visible number beside it.
 */
export function SalesFunnel({
  steps,
  isLoading,
  includeLegacy,
  onIncludeLegacyChange,
}: SalesFunnelProps) {
  const { moneyCompact } = useMoney();

  const maxEntered = useMemo(
    () => Math.max(1, ...steps.map((s) => s.entered)),
    [steps],
  );
  const hasAnyEntry = steps.some((s) => s.entered > 0);

  return (
    <Card>
      <CardHeader className="p-4 pb-2 flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base font-semibold">Sales funnel</CardTitle>
        <div className="flex items-center gap-2">
          <Switch
            id="funnel-include-legacy"
            checked={includeLegacy}
            onCheckedChange={onIncludeLegacyChange}
          />
          <Label
            htmlFor="funnel-include-legacy"
            className="text-xs font-normal text-muted-foreground cursor-pointer"
          >
            Include legacy accounts
          </Label>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !hasAnyEntry ? (
          <p className="text-sm text-muted-foreground">
            No stage movement in this window.
            {!includeLegacy && ' Accounts that went live before it are excluded —'
              + ' turn on "Include legacy accounts" to count them.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left font-medium pb-2">Step</th>
                  <th
                    className="text-right font-medium pb-2 w-16"
                    title="Deals that entered this step inside the window"
                  >
                    Deals
                  </th>
                  <th className="text-right font-medium pb-2 w-24">Value</th>
                  <th
                    className="text-right font-medium pb-2 w-16"
                    title="Share that later reached the next step or beyond"
                  >
                    → Conv
                  </th>
                  <th
                    className="text-right font-medium pb-2 w-16"
                    title="Median days to reach the next step"
                  >
                    Days
                  </th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.step} className="border-t">
                    <td className="py-1.5 pr-3">
                      {s.isSynthetic ? (
                        <span className="truncate">{s.label}</span>
                      ) : (
                        <Link
                          to={`/accounts?stage=${s.step}`}
                          className="group flex items-center gap-2 hover:underline"
                        >
                          <span className="truncate">{s.label}</span>
                        </Link>
                      )}
                      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-chart-1"
                          style={{ width: `${(s.entered / maxEntered) * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                      {s.entered}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                      {s.value > 0 ? moneyCompact(s.value) : '—'}
                    </td>
                    <td
                      className={cn(
                        'py-1.5 pr-3 text-right font-mono tabular-nums font-semibold',
                        s.rate === null && 'font-normal text-muted-foreground',
                      )}
                    >
                      {s.isSynthetic ? '' : formatRate(s.rate)}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                      {s.medianDaysToNext !== null ? `${s.medianDaysToNext}d` : s.isSynthetic ? '' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              Deals entered each step inside the window; Conv counts deals that reached the next
              step <em>or beyond</em>, so skipping a stage is not a loss. Won = first real usage,
              not the commercial yes.{' '}
              {includeLegacy ? (
                <>
                  <b>Legacy accounts included:</b> every account live today also counts as won and
                  as one unit in each earlier step, even when its history predates the window — so
                  this tail is current state, not flow, and will read higher than the True wins card.
                </>
              ) : (
                <>Only movement inside the window counts, so accounts that went live earlier are
                  absent.</>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
