import type {
  PipelineStage,
  LossReasonCategory,
  DisqualifyReason,
  ChurnReason,
} from './transitionStage';

// Reason option lists for each reason-gated terminal stage. These mirror the
// Postgres enums (loss_reason_category, disqualify_reason, churn_reason) and are
// the single source of truth for user-facing labels.

export const LOSS_REASONS: { value: LossReasonCategory; label: string }[] = [
  { value: 'no_budget',                     label: 'No budget' },
  { value: 'no_volume',                     label: 'Insufficient volume' },
  { value: 'bad_timing',                    label: 'Bad timing' },
  { value: 'current_stack_sufficient',      label: 'Current stack sufficient' },
  { value: 'misunderstood_proposal',        label: 'Misunderstood proposal' },
  { value: 'wrong_channel',                 label: 'Wrong channel' },
  { value: 'integration_too_heavy',         label: 'Integration too heavy' },
  { value: 'no_internal_owner',             label: 'No internal owner' },
  { value: 'decision_maker_disengaged',     label: 'Decision-maker disengaged' },
  { value: 'competitor_blocks',             label: 'Competitor blocks' },
  { value: 'compliance_risk',               label: 'Compliance risk' },
  { value: 'we_declined_no_fit',            label: 'We declined — no fit' },
];

export const DISQUALIFY_REASONS: { value: DisqualifyReason; label: string }[] = [
  { value: 'no_fit',            label: 'No fit' },
  { value: 'no_budget',         label: 'No budget' },
  { value: 'no_volume',         label: 'Insufficient volume' },
  { value: 'wrong_channel',     label: 'Wrong channel' },
  { value: 'no_response',       label: 'No response' },
  { value: 'bad_timing',        label: 'Bad timing' },
  { value: 'competitor_locked', label: 'Locked with competitor' },
  { value: 'no_internal_owner', label: 'No internal owner' },
];

export const CHURN_REASONS: { value: ChurnReason; label: string }[] = [
  { value: 'price',               label: 'Price' },
  { value: 'low_usage',           label: 'Low usage' },
  { value: 'poor_results',        label: 'Poor results' },
  { value: 'missing_features',    label: 'Missing features' },
  { value: 'switched_competitor', label: 'Switched to competitor' },
  { value: 'lost_champion',       label: 'Lost champion' },
  { value: 'budget_cut',          label: 'Budget cut' },
  { value: 'compliance',          label: 'Compliance' },
];

// Terminal stages whose transition_stage() RPC requires a reason in metadata.
export type ReasonGatedStage = 'disqualified' | 'closed_lost' | 'churned';

// Which `transition_stage` metadata key carries the reason for each stage.
export type ReasonMetadataKey =
  | 'disqualify_reason'
  | 'loss_reason_category'
  | 'churn_reason';

export interface StageReasonConfig {
  /** Metadata key passed to transition_stage. */
  metadataKey: ReasonMetadataKey;
  /** Selectable reason options for this stage. */
  options: { value: string; label: string }[];
  /** Modal title shown to the user. */
  title: string;
  /** Verb used in the confirm button / toast (e.g. "Disqualify"). */
  actionLabel: string;
}

export const STAGE_REASON_CONFIG: Record<ReasonGatedStage, StageReasonConfig> = {
  disqualified: {
    metadataKey: 'disqualify_reason',
    options: DISQUALIFY_REASONS,
    title: 'Disqualify account',
    actionLabel: 'Disqualify',
  },
  closed_lost: {
    metadataKey: 'loss_reason_category',
    options: LOSS_REASONS,
    title: 'Mark Closed Lost',
    actionLabel: 'Mark Closed Lost',
  },
  churned: {
    metadataKey: 'churn_reason',
    options: CHURN_REASONS,
    title: 'Mark Churned',
    actionLabel: 'Mark Churned',
  },
};

/**
 * Reasons that mean "someone else's contract is in the way".
 *
 * This is the highest-yield moment to capture the incumbent: the rep has the
 * context fresh and is already stopped, being made to think. Every other moment
 * competes with something. Note `bad_timing` is in here for both stages: it is
 * the reason reps reach for when the real answer is "locked until March".
 *
 * `churned` is deliberately absent. There the incumbent being displaced is us.
 */
const INCUMBENT_PROMPTING_REASONS: Record<ReasonGatedStage, ReadonlySet<string>> = {
  disqualified: new Set(['competitor_locked', 'bad_timing']),
  closed_lost: new Set(['competitor_blocks', 'current_stack_sufficient', 'bad_timing']),
  churned: new Set(),
};

/** True when the exit reason justifies asking who the incumbent is. */
export function shouldPromptForIncumbent(
  stage: ReasonGatedStage,
  reason: string,
): boolean {
  return reason ? INCUMBENT_PROMPTING_REASONS[stage].has(reason) : false;
}

const REASON_GATED_SET = new Set<string>(Object.keys(STAGE_REASON_CONFIG));

/** True when moving to `stage` requires collecting a reason first. */
export function isReasonGated(stage: PipelineStage): stage is ReasonGatedStage {
  return REASON_GATED_SET.has(stage);
}
