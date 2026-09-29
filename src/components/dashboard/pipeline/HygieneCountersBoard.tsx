import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useHygieneCounters } from '@/hooks/useHygieneCounters';
import {
  FLAG_META,
  HYGIENE_FLAGS,
  rowsForCell,
  type HygieneFlag,
} from '@/lib/hygieneCounters';
import { stageLabel } from '@/lib/pipelineStages';

/**
 * The daily alerts board: every counter has a target of zero, per owner. The daily ritual is each owner opening this at 8h30 and
 * clearing their reds before any call — so the board leads with the owners,
 * shows green explicitly (a clean column IS the good news), and a click on any
 * non-zero cell expands the accounts behind it right here rather than
 * navigating away.
 *
 * It opens the Pipeline tab (the dashboard's landing tab) for that reason: the
 * ritual has to be the first thing on screen. It shares `useHygieneCounters`
 * with AccountsMoneyView further down the same tab, so both read one fetch.
 */
export function HygieneCountersBoard() {
  const { rows, board, isLoading, error } = useHygieneCounters();
  const [openCell, setOpenCell] = useState<{ flag: HygieneFlag; owner: string | null } | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-semibold">Daily hygiene · target zero</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  // The dashboard-level banner already covers load errors; render nothing extra.
  if (error) return null;

  // Every counter is fixable from the CRM, so all of them render. A counter
  // that reads a field nobody can type would flag every account forever.
  const visibleFlags = HYGIENE_FLAGS;

  const openRows = openCell ? rowsForCell(rows, openCell.flag, openCell.owner) : [];

  return (
    <Card>
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          Daily hygiene · target zero
        </CardTitle>
        {board.grandTotal === 0 ? (
          <span className="text-xs font-medium text-success flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> All clear
          </span>
        ) : (
          <span className="text-xs text-muted-foreground tabular-nums">
            {board.grandTotal} to clear
          </span>
        )}
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {board.grandTotal === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every counter is at zero. Go sell something.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium text-xs uppercase tracking-wide text-muted-foreground py-2 pr-4">
                    Counter
                  </th>
                  {board.owners.map((o) => (
                    <th
                      key={o.ownerUserId ?? 'unassigned'}
                      className="text-right font-medium text-xs uppercase tracking-wide text-muted-foreground py-2 px-3 whitespace-nowrap"
                    >
                      {o.ownerDisplayName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleFlags.map((flag) => {
                  const meta = FLAG_META[flag];
                  return (
                    <tr key={flag} className="border-b border-border last:border-0">
                      <td className="py-1.5 pr-4 whitespace-nowrap">
                        <span className="text-muted-foreground tabular-nums text-xs mr-2">
                          {meta.counter}
                        </span>
                        {meta.label}
                      </td>
                      {board.owners.map((o) => {
                        const count = o.counts[flag] ?? 0;
                        const isOpen =
                          openCell?.flag === flag && openCell?.owner === o.ownerUserId;
                        return (
                          <td key={o.ownerUserId ?? 'unassigned'} className="text-right px-3">
                            {count === 0 ? (
                              <span className="text-muted-foreground/50">0</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenCell(isOpen ? null : { flag, owner: o.ownerUserId })
                                }
                                className={cn(
                                  'inline-flex min-w-7 justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors',
                                  meta.severity === 'crit'
                                    ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                                    : 'bg-warning/10 text-warning hover:bg-warning/20',
                                  isOpen && 'ring-1 ring-current',
                                )}
                              >
                                {count}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {openCell && openRows.length > 0 && (
              <div className="mt-3 rounded-md border bg-muted/30">
                <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">
                  {FLAG_META[openCell.flag].label}
                </p>
                <div className="divide-y">
                  {openRows.map((r) => (
                    <Link
                      key={`${r.accountId}-${r.flag}`}
                      to={`/account/${r.accountId}`}
                      className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors"
                    >
                      <span className="text-sm font-medium truncate">{r.accountName}</span>
                      {r.pipelineStage && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {stageLabel(r.pipelineStage, true)}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground truncate ml-auto">
                        {r.detail}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
