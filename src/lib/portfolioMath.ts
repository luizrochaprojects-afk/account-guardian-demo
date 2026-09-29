/**
 * Portfolio aggregations, with two deliberate behaviour choices noted inline.
 *
 * WHY THIS FILE EXISTS:
 * That block was ~280 lines of business rules living inside `useMemo` calls in a
 * 794-line component, with ZERO test coverage. It encodes every subtle decision
 * in the product — which accounts count toward "healthy", what "going dark"
 * means, when a completion percentage is null rather than zero. Pulling it into
 * a React-free module is what makes those rules testable and reviewable.
 *
 * PURITY RULE: no `Date.now()`, no I/O. Anything time-dependent takes an
 * explicit `now` argument. That is the whole reason these functions can be
 * tested deterministically.
 */
import {
  HEALTH_THRESHOLD_HEALTHY,
  HEALTH_THRESHOLD_CONCERNING,
} from './healthScoring';

export const DAY_MS = 86_400_000;

/**
 * The minimum shape these functions need. Structural rather than importing
 * `Account` from AccountsContext so tests can build fixtures without dragging in
 * the whole context type (and so a change to an unrelated Account field does not
 * ripple into this module).
 */
export interface PortfolioAccount {
  id: string;
  name: string;
  arr: number;
  mrr: number;
  healthScore: number;
  lastContact?: string | null;
  createdAt?: string | null;
}

export interface HealthLogRow {
  account_id: string;
  total_score: number;
  logged_at: string;
}

/** Days between `iso` and `now`; `Infinity` when the date is missing. */
export function daysSince(iso: string | null | undefined, now: number): number {
  if (!iso) return Infinity;
  return Math.floor((now - new Date(iso).getTime()) / DAY_MS);
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export interface MrrKpis {
  totalARR: number;
  accountCount: number;
  healthyARR: number;
  healthyCount: number;
  healthyPct: number;
  riskARR: number;
  riskCount: number;
  totalMRR: number;
  /**
   * How many accounts actually carry an `mrr` target. NOT `accountCount`:
   * `totalMRR` is a per-account target someone types in, and most accounts
   * never get one, so captioning the sum with the portfolio size claims a
   * coverage it does not have.
   */
  mrrAccountCount: number;
  healthyMRR: number;
  riskMRR: number;
  avgHealth: number;
  avgHealthDelta: number;
  scoredCount: number;
}

/**
 * ⚠️ THRESHOLD CHANGE, made deliberately:
 * The original used `< 50` for "at risk" while the health badges, the health
 * page, and scoreToHealthStatus all used `< 40` for the same word. Both spellings
 * existed for the same concept. This standardises on the health module's
 * constants, so "MRR at Risk" here means the same thing as an at-risk badge
 * elsewhere. The number this KPI reports will move — that is the point.
 *
 * ⚠️ THE `accountsWithLogs` GATE IS LOAD-BEARING:
 * An account with no health log has healthScore 0 by default. Counting it as
 * "poor" would make an unmeasured portfolio look like a failing one. So scored
 * accounts drive healthy/risk numerators, while totalARR/totalMRR span every
 * account. The two denominators genuinely differ; do not "fix" the asymmetry.
 */
export function computeMrrKpis(
  accounts: PortfolioAccount[],
  accountsWithLogs: Set<string>,
  recentLogs: HealthLogRow[],
  now: number,
): MrrKpis {
  const scored = accounts.filter((a) => accountsWithLogs.has(a.id));
  const isHealthy = (a: PortfolioAccount) =>
    accountsWithLogs.has(a.id) && a.healthScore >= HEALTH_THRESHOLD_HEALTHY;
  const isAtRisk = (a: PortfolioAccount) =>
    accountsWithLogs.has(a.id) && a.healthScore < HEALTH_THRESHOLD_CONCERNING;

  const sum = (xs: PortfolioAccount[], f: (a: PortfolioAccount) => number) =>
    xs.reduce((s, a) => s + f(a), 0);

  const healthy = accounts.filter(isHealthy);
  const atRisk = accounts.filter(isAtRisk);

  const avgHealth = scored.length
    ? Math.round(sum(scored, (a) => a.healthScore) / scored.length)
    : 0;

  // 7-day-ago baseline.
  //
  // ⚠️ `recentLogs` arrives sorted DESCENDING by logged_at, so the first log
  // at-or-before the cutoff that we see per account is that account's most
  // recent old log — which is the correct baseline. Feeding this an ascending
  // list silently changes the answer to "oldest log ever", so the ordering is a
  // precondition, not an incidental detail.
  const cutoff = new Date(now - 7 * DAY_MS).toISOString().split('T')[0];
  const oldByAccount = new Map<string, number>();
  for (const l of recentLogs) {
    if (l.logged_at <= cutoff && !oldByAccount.has(l.account_id)) {
      oldByAccount.set(l.account_id, l.total_score);
    }
  }
  const oldAvg = oldByAccount.size
    ? Math.round([...oldByAccount.values()].reduce((a, b) => a + b, 0) / oldByAccount.size)
    : 0;

  return {
    totalARR: sum(accounts, (a) => a.arr),
    accountCount: accounts.length,
    healthyARR: sum(healthy, (a) => a.arr),
    healthyCount: healthy.length,
    healthyPct: scored.length ? Math.round((healthy.length / scored.length) * 100) : 0,
    riskARR: sum(atRisk, (a) => a.arr),
    riskCount: atRisk.length,
    totalMRR: sum(accounts, (a) => a.mrr),
    mrrAccountCount: accounts.filter((a) => Number(a.mrr) > 0).length,
    healthyMRR: sum(healthy, (a) => a.mrr),
    riskMRR: sum(atRisk, (a) => a.mrr),
    avgHealth,
    // 0, never NaN, when there is no baseline to compare against.
    avgHealthDelta: oldByAccount.size ? avgHealth - oldAvg : 0,
    scoredCount: scored.length,
  };
}
