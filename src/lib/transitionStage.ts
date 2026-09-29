import { db } from '@/demo/db';
import type { Database } from '@/types/database';

export type PipelineStage = Database['public']['Enums']['pipeline_stage'];
export type PipelinePhase = Database['public']['Enums']['pipeline_phase'];
export type LossReasonCategory = Database['public']['Enums']['loss_reason_category'];
export type DisqualifyReason = Database['public']['Enums']['disqualify_reason'];
export type ChurnReason = Database['public']['Enums']['churn_reason'];

// The full set of valid `pipeline_stage` enum values, in pipeline order grouped
// by phase (SDR → Sales → Onboarding → Customer). Kept here as the single source
// of truth so any code that writes the column can validate first — Postgres
// rejects the whole insert/update with `invalid input value for enum` when
// handed a value outside this set (e.g. the legacy label 'Onboarding').
//
// `active_customer` was RENAMED to `steady`; it is not a valid
// value any more and coercePipelineStage() must return null for it, so a stale
// CSV or bookmark fails loudly instead of writing a stage the DB will reject.
export const PIPELINE_STAGES: readonly PipelineStage[] = [
  'target', 'working', 'paused', 'disqualified',
  'discovery_call', 'qualified_opportunity', 'business_case', 'sign_off', 'closed_lost',
  'closed_won', 'setup', 'pilot_running', 'pilot_review', 'adoption',
  'ramping', 'steady', 'expanding', 'at_risk', 'churned',
];

const PIPELINE_STAGE_SET = new Set<string>(PIPELINE_STAGES);

/**
 * Coerce an arbitrary string (e.g. a legacy capitalized lifecycle label like
 * 'Onboarding') into a valid `pipeline_stage` enum value, or `null` when it
 * can't be mapped. Case-insensitive. Returning `null` keeps account
 * inserts/updates from being rejected wholesale by the enum constraint.
 */
export function coercePipelineStage(value: unknown): PipelineStage | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return PIPELINE_STAGE_SET.has(v) ? (v as PipelineStage) : null;
}

export interface TransitionMetadata {
  loss_reason_category?: LossReasonCategory;
  disqualify_reason?: DisqualifyReason;
  churn_reason?: ChurnReason;
  loss_reason_detail?: string;
  /**
   * Audit marker set by the resurrection queue's Reengage action when a lost
   * account comes back to `working`. Lands in account_stage_history.metadata,
   * which is how metrics separate episodes of the same account.
   */
  reengaged?: boolean;
  /**
   * Auditable escape for entering pilot_running before the usage sync has
   * caught up: asserts usage was confirmed outside the product data.
   */
  golive_confirmed?: boolean;
  /**
   * Required by transition_stage when the destination is in the `customer`
   * phase and is not `churned`: that phase is owned by
   * classify_customer_stages(), so a human landing an account there is an
   * override and has to justify it. The RPC raises 23514 without it.
   */
  pin_reason?: string;
}

export class TransitionStageError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'TransitionStageError';
  }
}

export async function transitionStage(
  accountId: string,
  newStage: PipelineStage,
  metadata: TransitionMetadata = {},
) {
  const { data, error } = await db.rpc('transition_stage', {
    p_account_id: accountId,
    p_new_stage: newStage,
    p_metadata: metadata as unknown as Database['public']['Tables']['accounts']['Row']['qualification_checklist'],
  });
  if (error) throw new TransitionStageError(error.message, error.code);
  return data as Database['public']['Tables']['accounts']['Row'];
}
