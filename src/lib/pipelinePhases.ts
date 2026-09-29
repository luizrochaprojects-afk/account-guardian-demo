import type { PipelinePhase, PipelineStage } from './transitionStage';

export type StageDef = { key: PipelineStage; label: string; terminal?: boolean };

/**
 * The pipeline board's stage catalog, grouped by phase. This is the single
 * source of truth for both the board UI (column order + labels) and the
 * stage → phase mapping used when writing `accounts.pipeline_phase`.
 *
 * Kept here rather than in the board component because `phaseForStage()` is
 * consumed by the data layer (`AccountsContext.addAccount`), which must not
 * import React components.
 */
export const PIPELINE_PHASES: { phase: PipelinePhase; label: string; stages: StageDef[] }[] = [
  { phase: 'sdr', label: 'SDR', stages: [
    { key: 'target',       label: 'Target' },
    { key: 'working',      label: 'Working' },
    { key: 'paused',       label: 'Paused' },
    { key: 'disqualified', label: 'Disqualified', terminal: true },
  ] },
  { phase: 'sales', label: 'Sales', stages: [
    { key: 'discovery_call',        label: 'Meeting booked' },
    { key: 'qualified_opportunity', label: 'Qualified Opp.' },
    { key: 'business_case',         label: 'Business Case' },
    { key: 'sign_off',              label: 'Sign-off' },
    { key: 'closed_lost',           label: 'Closed Lost', terminal: true },
  ] },
  // Post-close labels: closed_won is the signature, setup is a pending
  // go-live, pilot_running is go-live with real usage — the true "won" when
  // value only shows in real usage — and the last two columns are the ramp. Enum keys
  // unchanged on purpose: labels are presentation, history is data.
  { phase: 'onboarding', label: 'Onboarding', stages: [
    { key: 'closed_won',      label: 'Won' },
    { key: 'setup',           label: 'Go-Live Pending' },
    { key: 'pilot_running',   label: 'First Usage' },
    { key: 'pilot_review',    label: 'Ramp Review' },
    // Onboarding ENDS here. The handoff to the Customer board happens on
    // first real usage, driven by classify_customer_stages().
    { key: 'adoption',        label: 'Ramped' },
  ] },
  /**
   * The Customer phase is not a funnel — it is a priority ladder over live
   * accounts, and the classifier (not a human dragging cards) decides which
   * column each one sits in. Columns are ordered by how much attention they
   * deserve, not by sequence: an account moves between them in both directions
   * for as long as it is a customer.
   *
   * Contraction and dormancy are deliberately NOT columns. Five columns is the
   * agreed shape, so those travel as badges on the card — which means the card
   * has to carry them, or the information disappears.
   */
  { phase: 'customer', label: 'Customer', stages: [
    { key: 'ramping',   label: 'Ramping' },
    { key: 'steady',    label: 'Steady' },
    { key: 'expanding', label: 'Expanding' },
    { key: 'at_risk',   label: 'At Risk' },
    { key: 'churned',   label: 'Churned', terminal: true },
  ] },
];

export const ALL_STAGES: StageDef[] = PIPELINE_PHASES.flatMap((p) => p.stages);

/** Derived from PIPELINE_PHASES so the two can never disagree. */
export const STAGE_TO_PHASE = Object.fromEntries(
  PIPELINE_PHASES.flatMap((p) => p.stages.map((s) => [s.key, p.phase])),
) as Record<PipelineStage, PipelinePhase>;

/**
 * Which phase a stage belongs to. `null` in → `null` out, so callers can pipe
 * the result of `coercePipelineStage()` straight through.
 *
 * The `transition_stage` RPC derives `pipeline_phase` server-side on every
 * move; this mirrors that derivation for the INSERT path, which the RPC never
 * touches (see `AccountsContext.addAccount`).
 */
export function phaseForStage(stage: PipelineStage | null): PipelinePhase | null {
  return stage ? STAGE_TO_PHASE[stage] ?? null : null;
}
