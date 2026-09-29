/**
 * Portfolio-level aggregates for the Customer board header.
 *
 * Split out of the component for the same reason `portfolioMath.ts` was: these
 * are business rules, not rendering. Retention in particular has exactly one
 * correct denominator and several plausible wrong ones, and the difference only
 * shows up as a number that looks fine and isn't.
 *
 * PURITY RULE: no Date.now(), no I/O — `now` is always an argument.
 *
 * The rates returned here always carry their numerator and denominator. That is
 * a house rule, not decoration: "106%" invites trust, while "84k / 79k = 106%"
 * invites the follow-up question that catches a bad denominator.
 */
import type { CustomerSignals, CustomerThresholds } from './customerSignals';
import { DEFAULT_CUSTOMER_THRESHOLDS, DAY_MS } from './customerSignals';

/** A rate that can always show its work. */
export interface Ratio {
  numerator: number;
  denominator: number;
  /** `null` when the denominator is zero — never 0, never NaN, never Infinity. */
  rate: number | null;
  /** How many accounts contributed to the denominator. */
  sampleSize: number;
}

function ratio(numerator: number, denominator: number, sampleSize: number): Ratio {
  return {
    numerator,
    denominator,
    rate: denominator > 0 ? numerator / denominator : null,
    sampleSize,
  };
}

/**
 * Net usage retention over the trailing 4 weeks vs. the 4 before it.
 *
 * ⚠️ THE DENOMINATOR IS THE WHOLE POINT. Only accounts that used the product in
 * the PREVIOUS window count — on both sides of the fraction. Including accounts
 * that did not exist back then would put their usage in the numerator with
 * nothing in the denominator, and retention would climb every time a customer
 * was won. That is a new-logo metric wearing a retention metric's name.
 *
 * Churn, contraction and expansion all fall out of this automatically: a
 * churned account keeps its old usage in the denominator and contributes zero
 * to the numerator, which is exactly the hit it should take.
 */
export function netUsageRetention(rows: readonly CustomerSignals[]): Ratio {
  const cohort = rows.filter((r) => r.usagePrev4w > 0);
  const numerator = cohort.reduce((s, r) => s + (r.pipelineStage === 'churned' ? 0 : r.usage4w), 0);
  const denominator = cohort.reduce((s, r) => s + r.usagePrev4w, 0);
  return ratio(numerator, denominator, cohort.length);
}

/**
 * Gross usage retention. Same cohort as NRR, but no account may contribute
 * more than it did before — capped PER ACCOUNT, not on the total, or one big
 * expansion would hide a dozen contractions.
 */
export function grossUsageRetention(rows: readonly CustomerSignals[]): Ratio {
  const cohort = rows.filter((r) => r.usagePrev4w > 0);
  const numerator = cohort.reduce(
    (s, r) => s + (r.pipelineStage === 'churned' ? 0 : Math.min(r.usage4w, r.usagePrev4w)),
    0,
  );
  const denominator = cohort.reduce((s, r) => s + r.usagePrev4w, 0);
  return ratio(numerator, denominator, cohort.length);
}

export interface PortfolioSummary {
  activeCustomers: number;
  usage4w: number;
  usageDeltaPct: number | null;
  nrr: Ratio;
  grr: Ratio;
  dormant: number;
  contracting: number;
  withoutFreshSignals: number;
}

/**
 * One pass over the board's rows. Churned accounts are excluded from every
 * "current" number (they are not customers any more) but they stay in the
 * retention denominators, which is the entire reason retention is a useful
 * number rather than a flattering one.
 */
export function summarizeCustomerPortfolio(
  rows: readonly CustomerSignals[],
  cfg: CustomerThresholds = DEFAULT_CUSTOMER_THRESHOLDS,
): PortfolioSummary {
  const live = rows.filter((r) => r.pipelineStage !== 'churned');
  const curr = live.reduce((s, r) => s + r.usage4w, 0);
  const prev = live.reduce((s, r) => s + r.usagePrev4w, 0);

  return {
    activeCustomers: live.length,
    usage4w: curr,
    usageDeltaPct: prev > 0 ? (curr - prev) / prev : null,
    nrr: netUsageRetention(rows),
    grr: grossUsageRetention(rows),
    dormant: live.filter(
      (r) => r.weeksSinceLastUsage !== null && r.weeksSinceLastUsage >= cfg.dormantWeeks,
    ).length,
    contracting: live.filter(
      (r) =>
        r.signalQuality === 'full' &&
        r.usageDeltaPct !== null &&
        r.usageDeltaPct <= -(cfg.contractionThresholdPct / 100),
    ).length,
    withoutFreshSignals: live.filter((r) => r.signalQuality !== 'full').length,
  };
}

/** Accounts that entered At Risk within `days` — "who broke this week?". */
export function enteredRiskSince(
  rows: readonly CustomerSignals[],
  stageChangedAtById: ReadonlyMap<string, string | null>,
  days: number,
  now: number,
): CustomerSignals[] {
  return rows.filter((r) => {
    if (r.pipelineStage !== 'at_risk') return false;
    const at = stageChangedAtById.get(r.accountId);
    if (!at) return false;
    return (now - new Date(at).getTime()) / DAY_MS <= days;
  });
}

/**
 * Biggest usage drops, worst first. Only accounts with a real baseline — a
 * customer with no previous window has not "dropped", it has just started.
 */
export function topUsageDrops(rows: readonly CustomerSignals[], limit = 5): CustomerSignals[] {
  return rows
    .filter((r) => r.usageDeltaPct !== null && r.usageDeltaPct < 0)
    .sort((a, b) => (a.usageDeltaPct ?? 0) - (b.usageDeltaPct ?? 0))
    .slice(0, limit);
}

/** `1234567` → `'1.2M'`, `84000` → `'84k'`. Compact, for a dense header. */
export function compactAmount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${Math.round(n)}`;
}

/**
 * `'84k / 79k = 106%'`. Shows its work by default — see the module header.
 * Renders '—' rather than '0%' when there is no denominator.
 */
export function formatRatio(r: Ratio): string {
  if (r.rate === null) return '—';
  const pct = `${Math.round(r.rate * 100)}%`;
  return `${compactAmount(r.numerator)} / ${compactAmount(r.denominator)} = ${pct}`;
}
