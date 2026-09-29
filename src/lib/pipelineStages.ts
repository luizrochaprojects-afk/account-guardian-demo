/**
 * Single source of truth for presenting the `pipeline_stage` enum.
 *
 * An enum spelled out in several places drifts: labels diverge, orderings
 * disagree, and tone maps keep keying on values that no longer exist.
 *
 * Two label sets are kept on purpose — dense tables genuinely need shorter text
 * than cards do. What is NOT kept is four independent copies of the enum.
 *
 * Ordering here mirrors `public.pipeline_stage_rank()` in supabase/schema.sql.
 * If you change one, change both, or the funnel and the board will disagree.
 */
import type { Database } from '@/types/database';

export type PipelineStage = Database['public']['Enums']['pipeline_stage'];
export type PipelinePhase = Database['public']['Enums']['pipeline_phase'];

/**
 * Forward path through the pipeline — the steps an account climbs once and does
 * not climb again. Mirrors pipeline_stage_rank() returning a number for exactly
 * these and NULL for everything else.
 *
 * Ends at `steady`: landing a customer at their expected usage level is the last
 * thing that happens *to* an account. What comes after is not progress, it is
 * behaviour (see LATERAL_STAGES).
 */
export const FORWARD_STAGES: readonly PipelineStage[] = [
  'target',
  'working',
  'discovery_call',
  'qualified_opportunity',
  'business_case',
  'sign_off',
  'closed_won',
  'setup',
  'pilot_running',
  'pilot_review',
  'adoption',
  'ramping',
  'steady',
] as const;

/**
 * Recurring states of a live customer. NOT funnel steps, and deliberately
 * unranked.
 *
 * ⚠️ This is the third category in a file that used to be binary
 * (forward | exit), and the distinction is load-bearing: an account cycles
 * steady → expanding → at_risk → steady many times in its life, so ranking
 * these would break the monotonicity `dashboard_stage_conversion` relies on
 * (it joins rank = from_rank + 1) and invent conversions that never happened.
 *
 * Consequence for callers: `stageRank(s) === null` no longer means "left the
 * pipeline". It means "not a funnel step", which is now either an exit OR a
 * live customer in a lateral state. Anything branching on that null must say
 * which of the two it meant — use EXIT_STAGES / LATERAL_STAGES explicitly.
 */
export const LATERAL_STAGES: readonly PipelineStage[] = [
  'expanding',
  'at_risk',
] as const;

/** Stages a deal leaves the pipeline through. */
export const EXIT_STAGES: readonly PipelineStage[] = [
  'paused',
  'disqualified',
  'closed_lost',
  'churned',
] as const;

/**
 * The sales spine — the six steps a conversion funnel should actually show.
 * The full 12-step forward path includes onboarding stages, which answer a
 * different question (are customers activating?) than "are we winning deals?".
 */
export const SALES_SPINE: readonly PipelineStage[] = [
  'working',
  'discovery_call',
  'qualified_opportunity',
  'business_case',
  'sign_off',
  'closed_won',
] as const;

/** Board/display order: forward path, then the lateral customer states, then exits. */
export const ALL_STAGES_ORDERED: readonly PipelineStage[] = [
  ...FORWARD_STAGES,
  ...LATERAL_STAGES,
  ...EXIT_STAGES,
] as const;

/** True for a live-customer state that an account can re-enter. */
export function isLateralStage(stage: PipelineStage): boolean {
  return LATERAL_STAGES.includes(stage);
}

/** True for a stage an account leaves the pipeline through. */
export function isExitStage(stage: PipelineStage): boolean {
  return EXIT_STAGES.includes(stage);
}

export const STAGE_LABELS: Record<PipelineStage, string> = {
  target: 'Target',
  working: 'Working',
  paused: 'Paused',
  disqualified: 'Disqualified',
  discovery_call: 'Meeting booked',
  qualified_opportunity: 'Qualified Opp.',
  business_case: 'Business Case',
  sign_off: 'Sign-off',
  closed_lost: 'Closed Lost',
  // Post-close vocabulary: the signature is only the go; setup is a pending
  // go-live; pilot_running is go-live with real usage — the true "won" when
  // value only shows in real usage; then the ramp review.
  // Enum keys deliberately unchanged: labels are presentation, history is data.
  closed_won: 'Won',
  setup: 'Go-Live Pending',
  pilot_running: 'First Usage',
  pilot_review: 'Ramp Review',
  adoption: 'Ramped',
  ramping: 'Ramping',
  steady: 'Steady',
  expanding: 'Expanding',
  at_risk: 'At Risk',
  churned: 'Churned',
};

/** Compact variants for dense tables. Preserves the wording the old
 *  PipelineHygieneView used — the component is gone, the wording is not. */
export const STAGE_SHORT_LABELS: Record<PipelineStage, string> = {
  ...STAGE_LABELS,
  // No discovery_call override: 'Meeting booked' already fits a dense table.
  qualified_opportunity: 'Qualified',
  business_case: 'Business case',
  pilot_running: 'Live',
  pilot_review: 'Ramp review',
  at_risk: 'At risk',
};

export type StageTone = 'info' | 'violet' | 'neutral' | 'success' | 'warning' | 'destructive';

/**
 * Soft tonal chip per stage — colour carries a hint without turning a list into
 * a carnival, so most stages stay neutral.
 *
 * Keyed on the real enum, so a missing entry is a type error rather than an
 * invisible default, and a map keyed on stale values cannot silently fall
 * through to neutral.
 */
export const STAGE_TONES: Record<PipelineStage, StageTone> = {
  target: 'info',
  working: 'info',
  paused: 'neutral',
  disqualified: 'neutral',
  discovery_call: 'violet',
  qualified_opportunity: 'violet',
  business_case: 'violet',
  sign_off: 'violet',
  closed_lost: 'destructive',
  closed_won: 'success',
  setup: 'neutral',
  pilot_running: 'warning',
  pilot_review: 'warning',
  adoption: 'success',
  // Quiet by default, loud on signal: only At Risk earns an attention colour on
  // the Customer board. A board where every column is coloured prioritises
  // nothing.
  ramping: 'info',
  steady: 'neutral',
  expanding: 'success',
  at_risk: 'warning',
  churned: 'destructive',
};

export function stageTone(stage: string | null | undefined): StageTone {
  if (!stage) return 'neutral';
  return STAGE_TONES[stage as PipelineStage] ?? 'neutral';
}

export const PHASE_LABELS: Record<PipelinePhase, string> = {
  sdr: 'SDR',
  sales: 'Sales',
  onboarding: 'Onboarding',
  customer: 'Customer',
};

export const LOSS_REASON_LABELS: Record<string, string> = {
  no_budget: 'No budget',
  no_volume: 'No volume',
  bad_timing: 'Bad timing',
  current_stack_sufficient: 'Current stack sufficient',
  misunderstood_proposal: 'Misunderstood proposal',
  wrong_channel: 'Wrong channel',
  integration_too_heavy: 'Integration too heavy',
  no_internal_owner: 'No internal owner',
  decision_maker_disengaged: 'Decision maker disengaged',
  competitor_blocks: 'Competitor blocks',
  compliance_risk: 'Compliance risk',
  we_declined_no_fit: 'We declined — no fit',
};

/** `disqualify_reason` enum. */
export const DISQUALIFY_REASON_LABELS: Record<string, string> = {
  no_fit: 'No fit',
  no_budget: 'No budget',
  no_volume: 'No volume',
  wrong_channel: 'Wrong channel',
  no_response: 'No response',
  bad_timing: 'Bad timing',
  competitor_locked: 'Competitor locked',
  no_internal_owner: 'No internal owner',
};

/**
 * `accounts.customer_risk_reason`, written only by the customer classifier
 * (src/lib/customerSignals.ts).
 *
 * Order matters and is not alphabetical: it is the severity ladder the
 * classifier evaluates top-down, and the default sort of the At Risk column.
 * Keep it in sync with `customerRiskReason()` — a risk without a legible reason
 * is just noise on a card.
 */
export const CUSTOMER_RISK_REASON_LABELS: Record<string, string> = {
  no_usage: 'No usage for 2+ weeks',
  poor_health: 'Health score dropped',
  gone_dark: 'No activity',
  contracting: 'Usage falling',
};

/** Severity order, worst first — drives the default sort of the At Risk column. */
export const CUSTOMER_RISK_SEVERITY: readonly string[] = Object.keys(
  CUSTOMER_RISK_REASON_LABELS,
);

export function customerRiskReasonLabel(key: string | null | undefined): string {
  if (!key) return '—';
  return CUSTOMER_RISK_REASON_LABELS[key] ?? key;
}

/** Position in the severity ladder; unknown reasons sort last, never first. */
export function customerRiskRank(key: string | null | undefined): number {
  if (!key) return Number.MAX_SAFE_INTEGER;
  const i = CUSTOMER_RISK_SEVERITY.indexOf(key);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

/** `churn_reason` enum. */
export const CHURN_REASON_LABELS: Record<string, string> = {
  price: 'Price',
  low_usage: 'Low usage',
  poor_results: 'Poor results',
  missing_features: 'Missing features',
  switched_competitor: 'Switched to competitor',
  lost_champion: 'Lost champion',
  budget_cut: 'Budget cut',
  compliance: 'Compliance',
};

/** Falls through to the raw key for unknown values, so nothing renders blank. */
export function stageLabel(stage: string | null | undefined, short = false): string {
  if (!stage) return '—';
  const map = short ? STAGE_SHORT_LABELS : STAGE_LABELS;
  return map[stage as PipelineStage] ?? stage;
}

export function lossReasonLabel(key: string | null | undefined): string {
  if (!key) return '—';
  return LOSS_REASON_LABELS[key] ?? key;
}

export function exitReasonLabel(key: string | null | undefined): string {
  if (!key) return '—';
  return (
    LOSS_REASON_LABELS[key] ??
    DISQUALIFY_REASON_LABELS[key] ??
    CHURN_REASON_LABELS[key] ??
    key
  );
}

/**
 * Forward position, or `null` for exit stages.
 * Mirrors `public.pipeline_stage_rank()` exactly.
 */
export function stageRank(stage: PipelineStage): number | null {
  const i = FORWARD_STAGES.indexOf(stage);
  return i === -1 ? null : i + 1;
}

export function phaseForStage(stage: PipelineStage): PipelinePhase {
  switch (stage) {
    case 'target':
    case 'working':
    case 'paused':
    case 'disqualified':
      return 'sdr';
    case 'discovery_call':
    case 'qualified_opportunity':
    case 'business_case':
    case 'sign_off':
    case 'closed_lost':
      return 'sales';
    // `churned` sits here, not under onboarding: churn is a customer event, and
    // it belongs to the phase whose question it answers ("did we keep them?").
    case 'ramping':
    case 'steady':
    case 'expanding':
    case 'at_risk':
    case 'churned':
      return 'customer';
    default:
      return 'onboarding';
  }
}

/**
 * `0.4213` → `'42%'`; `null` → `'—'`.
 *
 * `null`, never `0`, for an empty denominator: collapsing "no data" into "0%"
 * is the difference between "we have not run any discovery calls" and "every
 * discovery call failed".
 */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}
