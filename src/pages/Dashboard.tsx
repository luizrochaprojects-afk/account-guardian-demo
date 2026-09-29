import { Suspense, lazy, useCallback, useState } from 'react';
import { PackageOpen, RefreshCw } from 'lucide-react';
import { resetDemo } from '@/demo/store';
import { useQueryClient } from '@tanstack/react-query';

import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { KpiRowSkeleton, Skeleton } from '@/components/ui/skeleton';

import { useDashboardPeriod } from '@/hooks/useDashboardPeriod';
import { useTodayBoard } from '@/hooks/useTodayBoard';
import { useMoney } from '@/hooks/useMoney';
import { useProfile } from '@/hooks/useProfile';
import { DashboardPeriodControls } from '@/components/dashboard/DashboardPeriodControls';

/**
 * The operations dashboard. Its one tab, Pipeline, carries the hygiene board,
 * the funnel and the loss reasons.
 *
 * The tab stays lazy because it pulls recharts; the page pays a TabSkeleton for
 * that on first paint.
 */

const PipelineTab = lazy(() =>
  import('@/components/dashboard/tabs/PipelineTab').then((m) => ({ default: m.PipelineTab })),
);

function TabSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <KpiRowSkeleton count={4} label="Loading dashboard" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const period = useDashboardPeriod();
  const board = useTodayBoard();
  const { money } = useMoney();
  const { profile } = useProfile();
  const qc = useQueryClient();

  // Errors from the lazy tabs bubble up here so ONE banner covers both of them,
  // instead of each tab carrying its own near-identical card.
  const [tabError, setTabError] = useState<unknown>(null);
  const handleTabError = useCallback((error: unknown) => {
    console.error('[Dashboard] tab failed to load metrics:', error);
    setTabError(error);
  }, []);

  const hasError = board.hasLoadError || !!tabError;

  const retry = () => {
    setTabError(null);
    board.retry();
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const firstName = (profile?.display_name || '').split(' ')[0];

  // A brand-new workspace has nothing to chart. This guard lives at page level,
  // otherwise an empty workspace lands on a zeroed funnel instead of the
  // onboarding CTA.
  const isEmptyWorkspace = !board.accountsLoading && board.accounts.length === 0;

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader
          title={`${greeting()}${firstName ? `, ${firstName}` : ''}.`}
          description={`${board.kpis.accountCount} accounts · ${money(board.kpis.totalARR)} under management`}
          descriptionLoading={board.accountsLoading}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-6 pt-6 pb-10 flex flex-col gap-6">
            {isEmptyWorkspace ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <PackageOpen className="h-10 w-10 text-muted-foreground" />
                <div className="text-center">
                  <h2 className="text-base font-semibold">Your workspace is empty</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Reset the demo to load the sample workspace again.
                  </p>
                </div>
                <Button size="sm" onClick={() => resetDemo()}>
                  Reset demo data
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <h2 className="text-sm font-medium text-muted-foreground">Pipeline</h2>
                  <DashboardPeriodControls period={period} />
                </div>

                {hasError && (
                  <Card className="border-destructive/50">
                    <CardContent className="py-4 flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-destructive">
                          Some of your dashboard didn't load
                        </p>
                        <p className="text-xs text-muted-foreground">
                          A few sections may be incomplete. Try again.
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={retry} className="shrink-0">
                        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Try again
                      </Button>
                    </CardContent>
                  </Card>
                )}

                <Suspense fallback={<TabSkeleton />}>
                  <PipelineTab since={period.since} onError={handleTabError} />
                </Suspense>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
