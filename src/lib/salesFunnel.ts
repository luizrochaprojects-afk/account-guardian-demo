/**
 * Pure presentation math for the Dashboard > Pipeline funnel.
 *
 * The RPC (dashboard_sales_funnel) only returns rows for steps somebody
 * actually entered in the window; this builder fills the full six-step path so
 * an empty step is legible as empty, and applies the arr→mrr money fallback.
 */
import { stageLabel, type PipelineStage } from '@/lib/pipelineStages';
import type { SalesFunnelRow } from '@/hooks/useSalesFunnel';

/** The five real spine stages the funnel shows, in order. */
const SPINE_STEPS: readonly PipelineStage[] = [
  'working',
  'discovery_call',
  'qualified_opportunity',
  'business_case',
  'sign_off',
] as const;

/**
 * The synthetic final step: won = first real usage
 * (accounts.first_usage_at), NOT the closed_won stage. Deliberately not
 * added to STAGE_LABELS — it is not a pipeline_stage.
 */
export const FIRST_USAGE_STEP = 'first_usage';
export const FIRST_USAGE_LABEL = 'First usage (true win)';

export interface FunnelStep {
  step: string;
  label: string;
  entered: number;
  /** ARR over the cohort, falling back to realized MRR (StageBoard's rule). */
  value: number;
  converted: number | null;
  /** Fraction 0–1 converted to the next step, or null on an empty cohort. */
  rate: number | null;
  medianDaysToNext: number | null;
  /** True for the first_usage step — no /accounts?stage= drilldown. */
  isSynthetic: boolean;
}

export function buildFunnelSteps(rows: SalesFunnelRow[]): FunnelStep[] {
  const byStep = new Map(rows.map((r) => [r.step, r]));

  const build = (step: string, label: string, isSynthetic: boolean): FunnelStep => {
    const row = byStep.get(step);
    return {
      step,
      label,
      entered: row?.entered ?? 0,
      value: (row?.arrTotal ?? 0) || (row?.currentMrrTotal ?? 0),
      converted: row?.converted ?? null,
      // null, never 0, when nobody entered — '—' must not read as "all failed".
      rate: row && row.entered > 0 ? row.rate : null,
      medianDaysToNext: row?.medianDaysToNext ?? null,
      isSynthetic,
    };
  };

  return [
    ...SPINE_STEPS.map((s) => build(s, stageLabel(s, true), false)),
    build(FIRST_USAGE_STEP, FIRST_USAGE_LABEL, true),
  ];
}
