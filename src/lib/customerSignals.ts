/**
 * The Customer board's brain, in TypeScript.
 *
 * After the close, accounts stop moving through a funnel and start moving
 * around a priority ladder — Ramping, Steady, Expanding, At Risk — driven by
 * what the customer actually does. A person does not drag these cards; the
 * classifier files them, a person can pin one for a while, and every card can
 * explain why it is where it is.
 *
 * In production the same rules run in SQL on a nightly job and this module
 * mirrors them, so the UI can explain a card without a round trip and preview a
 * reclassification, and so the ladder is testable at all. In the portfolio
 * edition this module is the only implementation (see src/demo/rpc).
 *
 * The inputs are generic product-usage signals — usage over the last four
 * weeks against the four before, time since last use, last human touch, health
 * score — so the ladder reads the same for any product whose value shows only in use.
 *
 * PURITY RULE: no `Date.now()`, no I/O. Anything time-dependent takes an
 * explicit `now`. That is the only reason these rules can be tested
 * deterministically.
 */
import type { PipelineStage } from './transitionStage';

export const DAY_MS = 86_400_000;

/** 40 = HEALTH_THRESHOLD_CONCERNING in healthScoring.ts. */
export const CUSTOMER_POOR_HEALTH_SCORE = 40;

/** How stale a health log may be before it stops counting as evidence. */
export const HEALTH_LOG_MAX_AGE_DAYS = 60;

/** A human's override stands this long, then expires. */
export const PIN_TTL_DAYS = 14;

/** "Reactivated" badge window, and the ramp grace after a win-back. */
export const REACTIVATED_BADGE_DAYS = 90;

/**
 * Org-configurable thresholds. Defaults are calibrated from the operating
 * model, not from observed data — the first thing to revisit once real usage
 * history exists.
 */
export interface CustomerThresholds {
  expansionThresholdPct: number;
  contractionThresholdPct: number;
  dormantWeeks: number;
  goneDarkDays: number;
  rampDays: number;
}

export const DEFAULT_CUSTOMER_THRESHOLDS: CustomerThresholds = {
  expansionThresholdPct: 25,
  contractionThresholdPct: 25,
  dormantWeeks: 4,
  goneDarkDays: 21,
  rampDays: 30,
};

/**
 * How much of the usage-derived data can be believed.
 *
 * `stale` is about the *pipeline*, not the account: the usage sync itself has
 * fallen behind, so no account's usage can be trusted regardless of how recent
 * its own last row looks. Without it, "we have no data" reads as "the customer
 * stopped", and growing accounts land in At Risk.
 */
export type SignalQuality = 'full' | 'partial' | 'stale' | 'none';

/** Value of `accounts.customer_risk_reason`. Ordered worst-first in
 *  CUSTOMER_RISK_SEVERITY (pipelineStages.ts). */
export type CustomerRiskReason =
  | 'no_usage'
  | 'poor_health'
  | 'gone_dark'
  | 'contracting';

/** Which branch of the ladder produced the answer — surfaced in the UI and
 *  stored in account_stage_history.metadata. */
export type CustomerRule =
  | 'pinned'
  | 'onboarding_handoff'
  | 'reactivation'
  | 'ramp_window'
  | 'expansion'
  | 'default'
  | CustomerRiskReason;

/**
 * One row of the per-account usage signals. Structural on purpose so tests can
 * build fixtures without dragging in the database types.
 *
 * `null` means "not computable", never zero: a customer with no baseline is not
 * a customer who fell 100%.
 */
export interface CustomerSignals {
  accountId: string;
  pipelineStage: PipelineStage;
  customerSince: string | null;
  firstUsageAt: string | null;
  lastUsageAt: string | null;
  reactivatedAt: string | null;
  customerStagePinnedAt: string | null;

  /** Usage units (active users, runs, events — whatever the product counts). */
  usage4w: number;
  usagePrev4w: number;
  usageDeltaPct: number | null;
  weeksSinceLastUsage: number | null;

  daysSinceLastActivity: number | null;
  healthScore: number | null;
  healthLoggedAt: string | null;

  cohort: 'M0' | 'M1+' | null;
  signalQuality: SignalQuality;
}

export interface Classification {
  stage: PipelineStage;
  rule: CustomerRule;
  /** Only set when `stage === 'at_risk'`. */
  riskReason: CustomerRiskReason | null;
}

function daysBetween(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  return (now - new Date(iso).getTime()) / DAY_MS;
}

/**
 * The risk ladder. Returns the FIRST rule that matches, worst first — a card
 * showing "At Risk" with no reason is noise, and a card showing the third-worst
 * reason understates the problem.
 *
 * Hard rules (1-3) always apply. The soft rule (4) is M1+ only: in the first
 * month usage is still climbing and lumpy, so applying it to M0 would fire
 * constantly and teach the user to ignore the column.
 *
 * Anything usage-derived requires `signalQuality === 'full'`. With a stale or
 * absent sync only health and activity are evidence — the board says "No usage
 * data" rather than quietly classifying on numbers from three weeks ago.
 */
export function customerRiskReason(
  s: CustomerSignals,
  cfg: CustomerThresholds = DEFAULT_CUSTOMER_THRESHOLDS,
  now: number = 0,
): CustomerRiskReason | null {
  const usageTrusted = s.signalQuality === 'full';

  // H1 — it already stopped.
  if (usageTrusted && s.firstUsageAt !== null && (s.weeksSinceLastUsage ?? 0) >= 2) {
    return 'no_usage';
  }

  // H2 — the relationship is measurably worse, and measured recently.
  const healthAge = daysBetween(s.healthLoggedAt, now);
  if (
    s.healthScore !== null &&
    healthAge !== null &&
    healthAge <= HEALTH_LOG_MAX_AGE_DAYS &&
    s.healthScore < CUSTOMER_POOR_HEALTH_SCORE
  ) {
    return 'poor_health';
  }

  // H3 — nobody has talked to them.
  if (s.daysSinceLastActivity !== null && s.daysSinceLastActivity > cfg.goneDarkDays) {
    return 'gone_dark';
  }

  // S1 — soft, established customers only.
  if (
    s.cohort === 'M1+' &&
    usageTrusted &&
    s.usageDeltaPct !== null &&
    s.usageDeltaPct <= -(cfg.contractionThresholdPct / 100)
  ) {
    return 'contracting';
  }

  return null;
}

/** Did usage come back after the account entered `churned`? */
function wasReactivated(s: CustomerSignals, churnedAt: string | null): boolean {
  if (!s.lastUsageAt || !churnedAt) return false;
  return new Date(s.lastUsageAt).getTime() > new Date(churnedAt).getTime();
}

/**
 * The priority ladder, first match wins, so an account lands in exactly one
 * column:
 *
 *   pinned → churned → at_risk → ramping → expanding → steady
 *
 * `ramping` deliberately outranks `expanding`: expansion only means something
 * measured against a baseline, and a three-week-old account has none. Growth is
 * the EXPECTED behaviour in M0 — counting it as expansion would inflate
 * retention with the ramp-up of new logos.
 *
 * Returns `null` when there is nothing to do (a pinned account, or an
 * `adoption` account that has not started using the product). Callers treat
 * null as "leave it alone".
 */
export function classifyCustomerStage(
  s: CustomerSignals,
  cfg: CustomerThresholds = DEFAULT_CUSTOMER_THRESHOLDS,
  now: number = 0,
  churnedAt: string | null = null,
): Classification | null {
  // 0. A human decided this, and the decision has not expired yet.
  const pinAge = daysBetween(s.customerStagePinnedAt, now);
  if (pinAge !== null && pinAge < PIN_TTL_DAYS) {
    return null;
  }

  // 1a. Onboarding hands over on first real usage.
  if (s.pipelineStage === 'adoption') {
    return s.firstUsageAt
      ? { stage: 'ramping', rule: 'onboarding_handoff', riskReason: null }
      : null;
  }

  // 1b. Churn is absorbing EXCEPT for usage coming back after the fact. The
  // classifier never moves an account INTO churned — that is a claim about a
  // relationship and needs a human plus a churn_reason.
  if (s.pipelineStage === 'churned') {
    return wasReactivated(s, churnedAt)
      ? { stage: 'ramping', rule: 'reactivation', riskReason: null }
      : null;
  }

  // 2. Risk beats everything else.
  const risk = customerRiskReason(s, cfg, now);
  if (risk) {
    return { stage: 'at_risk', rule: risk, riskReason: risk };
  }

  // 3. Ramp window. With no usage data at all fall back to customer_since, so a
  // three-year-old customer is not filed as "ramping" forever.
  const sinceFirstUsage = daysBetween(s.firstUsageAt, now);
  const sinceCustomer = daysBetween(s.customerSince, now);
  const sinceReactivation = daysBetween(s.reactivatedAt, now);
  const inRamp =
    s.cohort === 'M0' ||
    (sinceFirstUsage !== null && sinceFirstUsage < cfg.rampDays) ||
    (s.cohort === null && sinceCustomer !== null && sinceCustomer < cfg.rampDays) ||
    (sinceReactivation !== null && sinceReactivation < cfg.rampDays);
  if (inRamp) {
    return { stage: 'ramping', rule: 'ramp_window', riskReason: null };
  }

  // 4. Expansion — usage up past the threshold against the previous 4 weeks.
  if (
    s.signalQuality === 'full' &&
    s.usageDeltaPct !== null &&
    s.usageDeltaPct >= cfg.expansionThresholdPct / 100
  ) {
    return { stage: 'expanding', rule: 'expansion', riskReason: null };
  }

  // 5. Nothing to report. That is what Steady means — not "healthy", just
  // "no signal worth a column of its own".
  return { stage: 'steady', rule: 'default', riskReason: null };
}

/**
 * Badges. Contraction and dormancy are NOT columns — the board is five columns
 * wide by design — so they travel here. If the card stops rendering these, the
 * information disappears from the product entirely.
 */
export type CustomerBadge =
  | 'M0'
  | 'Contracting'
  | 'Dormant'
  | 'Reactivated'
  | 'No usage data'
  | 'Thin usage history'
  | 'Usage data stale'
  | 'Pinned';

export function customerBadges(
  s: CustomerSignals,
  cfg: CustomerThresholds = DEFAULT_CUSTOMER_THRESHOLDS,
  now: number = 0,
): CustomerBadge[] {
  const badges: CustomerBadge[] = [];

  // Two different stories, and telling them apart is the point: 'stale' means
  // the sync is late and the operator should go fix the pipeline; the others
  // mean this particular account has thin history and there is nothing to fix.
  if (s.signalQuality === 'stale') badges.push('Usage data stale');
  else if (s.signalQuality === 'partial') badges.push('Thin usage history');
  else if (s.signalQuality === 'none') badges.push('No usage data');

  if (s.weeksSinceLastUsage !== null && s.weeksSinceLastUsage >= cfg.dormantWeeks) {
    badges.push('Dormant');
  }

  if (
    s.signalQuality === 'full' &&
    s.usageDeltaPct !== null &&
    s.usageDeltaPct <= -(cfg.contractionThresholdPct / 100)
  ) {
    badges.push('Contracting');
  }

  const sinceReactivation = daysBetween(s.reactivatedAt, now);
  if (sinceReactivation !== null && sinceReactivation <= REACTIVATED_BADGE_DAYS) {
    badges.push('Reactivated');
  }

  if (s.cohort === 'M0') badges.push('M0');

  const pinAge = daysBetween(s.customerStagePinnedAt, now);
  if (pinAge !== null && pinAge < PIN_TTL_DAYS) badges.push('Pinned');

  return badges;
}

/**
 * Human-readable explanation of a classification, for the card and the account
 * page. A classifier that cannot explain itself is a black box, and a black box
 * sends the user back to the spreadsheet.
 */
export function explainClassification(c: Classification, s: CustomerSignals): string {
  const delta =
    s.usageDeltaPct !== null
      ? `${s.usageDeltaPct > 0 ? '+' : ''}${Math.round(s.usageDeltaPct * 100)}% vs. previous 4 weeks`
      : null;

  switch (c.rule) {
    case 'no_usage':
      return `At Risk — no usage for ${s.weeksSinceLastUsage} weeks`;
    case 'poor_health':
      return `At Risk — health score ${s.healthScore}, below ${CUSTOMER_POOR_HEALTH_SCORE}`;
    case 'gone_dark':
      return `At Risk — no activity for ${s.daysSinceLastActivity} days`;
    case 'contracting':
      return `At Risk — usage ${delta ?? 'falling'}`;
    case 'expansion':
      return `Expanding — usage ${delta ?? 'up'}`;
    case 'ramp_window':
      return 'Ramping — inside the first 30 days of usage';
    case 'onboarding_handoff':
      return 'Ramping — first usage recorded, handed over from Onboarding';
    case 'reactivation':
      return 'Ramping — usage came back after churn';
    case 'pinned':
      return 'Pinned by a person — the classifier is standing down';
    case 'default':
      return 'Steady — nothing to report';
  }
}
