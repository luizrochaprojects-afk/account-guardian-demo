import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { lossReasonLabel, stageLabel } from '@/lib/pipelineStages';
import type { LossReasonRow } from '@/hooks/useDashboardMetrics';

export interface LossReasonsCardProps {
  data: LossReasonRow[];
  isLoading: boolean;
}

/**
 * Why deals were lost, and from which stage.
 * Labels come from src/lib/pipelineStages.ts instead of a local copy of the
 * enum.
 *
 * Covers `closed_lost` only. `disqualify_reason` and `churn_reason` are separate
 * columns with their own vocabularies and are reported by
 * `dashboard_stage_exits` — do not fold them in here or three different
 * questions end up sharing one table.
 */
export function LossReasonsCard({ data, isLoading }: LossReasonsCardProps) {
  const rows = useMemo(
    () => [...data].sort((a, b) => b.account_count - a.account_count),
    [data],
  );

  return (
    <Card className="h-full">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base font-semibold">Loss reasons</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No closed-lost accounts in this window.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left font-medium pb-2">Reason</th>
                  <th className="text-left font-medium pb-2">From stage</th>
                  <th className="text-right font-medium pb-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={`${row.loss_reason_category}-${row.lost_from_stage}-${i}`} className="border-t">
                    <td className="py-1.5 pr-2">{lossReasonLabel(row.loss_reason_category)}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      {stageLabel(row.lost_from_stage)}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{row.account_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
