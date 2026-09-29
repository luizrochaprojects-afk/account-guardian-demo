import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { useAccounts } from '@/contexts/AccountsContext';
import { useProfile } from '@/hooks/useProfile';
import {
  DAY_MS,
  computeMrrKpis,
  type PortfolioAccount,
  type HealthLogRow,
} from '@/lib/portfolioMath';

/**
 * The dashboard's portfolio KPIs, in one use-case hook.
 *
 * What it serves is the MRR/ARR headline on the page header. It is one query
 * (health logs, which `computeMrrKpis` needs to tell a real zero from a
 * never-measured one) plus the account portfolio the context already holds.
 *
 * The `home:` query-key prefix is kept so the existing retry predicate
 * (invalidate everything starting with `home:`) keeps working unchanged.
 *
 * All aggregation lives in src/lib/portfolioMath.ts — pure, React-free, and
 * tested. This file only fetches and wires.
 */

const STALE = 5 * 60_000;

/**
 * Stable empty fallback. Inline `?? []` mints a fresh array on every render, so
 * every downstream useMemo would see changed dependencies and recompute the
 * whole portfolio each time — the exact opposite of what the memo is for. A
 * module-level constant keeps the identity fixed.
 */
const EMPTY_LOGS: HealthLogRow[] = [];

export function useTodayBoard() {
  const { accounts, loading: accountsLoading } = useAccounts();
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();

  const enabled = !!orgId;

  // Health logs — 8 days, so a 7-day-ago baseline is always inside the window.
  const logs = useQuery({
    queryKey: ['home:health_logs', orgId],
    enabled,
    staleTime: STALE,
    queryFn: async () => {
      const since = new Date(Date.now() - 8 * DAY_MS).toISOString().split('T')[0];
      const { data } = await db
        .from('health_score_logs')
        .select('account_id, total_score, logged_at')
        .eq('organization_id', orgId!)
        .gte('logged_at', since)
        .order('logged_at', { ascending: false });
      return data || [];
    },
  });

  const recentLogs = logs.data ?? EMPTY_LOGS;

  /**
   * A failed query surfaces a banner. Without it the header renders a
   * reassuring zero — "0 accounts under management" when the query 500s — which
   * is worse than showing nothing.
   */
  const hasLoadError = logs.isError;

  const retry = () =>
    qc.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('home:'),
    });

  const portfolio = accounts as unknown as PortfolioAccount[];

  const accountsWithLogs = useMemo(
    () => new Set<string>(recentLogs.map((l: { account_id: string }) => l.account_id)),
    [recentLogs],
  );

  const accountMap = useMemo(
    () => new Map(portfolio.map((a) => [a.id, a])),
    [portfolio],
  );

  const kpis = useMemo(
    () => computeMrrKpis(portfolio, accountsWithLogs, recentLogs, Date.now()),
    [portfolio, accountsWithLogs, recentLogs],
  );

  return {
    accounts: portfolio,
    accountsLoading,
    accountMap,
    accountsWithLogs,
    recentLogs,
    kpis,
    hasLoadError,
    retry,
  };
}
