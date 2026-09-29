/**
 * What is stopping this deal from advancing one stage.
 *
 * ⚠️ MIRROR — in production this file duplicates the gates inside the
 * `transition_stage()` SQL function (supabase/schema.sql). If you change one,
 * change both, or the UI will promise a transition the database refuses (or,
 * worse, stay silent about one it will refuse).
 *
 * The mirror is deliberate: the database is the enforcement, this is the
 * warning, and a warning that lives in a round-trip is a warning nobody sees
 * while typing. In the portfolio edition there is no database: the demo's
 * `transition_stage` (src/demo/rpc/transitionStage.ts) is a TypeScript port
 * that reads the checklist item lists from this module.
 *
 * Pure and synchronous on purpose — everything it needs is already loaded on
 * the account page, and being pure is what lets the blockers recompute on every
 * keystroke, so the signal disappears the moment a field is filled and comes
 * back if it is cleared.
 */
import type { Json } from '@/types/database';
import { FORWARD_STAGES, stageRank, type PipelineStage } from './pipelineStages';

/** Checklist items `transition_stage` requires to carry a definite answer. */
export const QUALIFICATION_REQUIRED_ITEMS = [
  'is_decision_maker',
  'pain_exists_genuinely',
  'budget_path',
  'timeline',
  'champion',
  'technical_fit',
] as const;

export type QualificationItemKey = (typeof QUALIFICATION_REQUIRED_ITEMS)[number];

/**
 * The subset that must be answered YES, not merely answered.
 *
 * An explicit "no" is a fine answer for most items — you can win without a
 * champion or a hard deadline. Not for these three: no decision maker, no
 * genuine pain, or no path to budget means there is no opportunity, whatever
 * the other answers say.
 */
export const QUALIFICATION_AFFIRMATIVE_ITEMS = [
  'is_decision_maker',
  'pain_exists_genuinely',
  'budget_path',
] as const;

/** Every field a blocker can point at. Used to key the UI signal. */
export type BlockerField =
  | 'mrr'
  | 'qualification_checklist'
  | 'deal_coverage'
  | 'payment_approver'
  | 'first_usage';

export interface StageBlocker {
  field: BlockerField;
  /** Human label for the thing that is missing. */
  label: string;
  /** Why it is required, phrased for the person who has to fill it in. */
  reason: string;
}

export interface ReadinessAccount {
  pipeline_stage: PipelineStage | null;
  mrr?: number | null;
  qualification_checklist?: Json | null;
  first_usage_at?: string | null;
}

export interface ReadinessContact {
  role_in_deal?: string | null;
  deal_engagement?: string | null;
}

export interface StageReadiness {
  /** The stage this account would advance to, or null if it is off the ladder. */
  nextStage: PipelineStage | null;
  blockers: StageBlocker[];
}

const EMPTY: StageReadiness = { nextStage: null, blockers: [] };

const isBlank = (v: string | null | undefined): boolean =>
  v === null || v === undefined || v.trim() === '';

function checklistAnswer(checklist: Json | null | undefined, key: string): string | undefined {
  if (!checklist || typeof checklist !== 'object' || Array.isArray(checklist)) return undefined;
  const item = (checklist as Record<string, unknown>)[key];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
  const answer = (item as Record<string, unknown>).answer;
  if (answer === true) return 'true';
  if (answer === false) return 'false';
  return typeof answer === 'string' ? answer : undefined;
}

/**
 * The next rung up. Mirrors the order check in transition_stage: only forward
 * moves along the ranked ladder are constrained, so a stage with no rank
 * (paused, disqualified, closed_lost, expanding, at_risk, churned) has no
 * "next" and produces no blockers — a deal has to be able to die from anywhere.
 */
export function nextForwardStage(stage: PipelineStage | null): PipelineStage | null {
  if (!stage) return null;
  const rank = stageRank(stage);
  if (rank === null) return null;
  const idx = FORWARD_STAGES.indexOf(stage);
  if (idx < 0 || idx + 1 >= FORWARD_STAGES.length) return null;
  return FORWARD_STAGES[idx + 1];
}

export function stageReadiness(
  account: ReadinessAccount | null | undefined,
  contacts: readonly ReadinessContact[] = [],
): StageReadiness {
  if (!account) return EMPTY;

  const nextStage = nextForwardStage(account.pipeline_stage);
  if (!nextStage) return EMPTY;

  const blockers: StageBlocker[] = [];

  if (nextStage === 'qualified_opportunity') {
    const unanswered = QUALIFICATION_REQUIRED_ITEMS.filter((k) => {
      const a = checklistAnswer(account.qualification_checklist, k);
      return a !== 'true' && a !== 'false';
    });
    const negative = QUALIFICATION_AFFIRMATIVE_ITEMS.filter(
      (k) => checklistAnswer(account.qualification_checklist, k) === 'false',
    );

    if (unanswered.length > 0) {
      blockers.push({
        field: 'qualification_checklist',
        label: 'Qualification checklist',
        reason:
          unanswered.length === 1
            ? `1 item still unanswered — qualifying needs all ${QUALIFICATION_REQUIRED_ITEMS.length} answered.`
            : `${unanswered.length} items still unanswered — qualifying needs all ${QUALIFICATION_REQUIRED_ITEMS.length} answered.`,
      });
    } else if (negative.length > 0) {
      blockers.push({
        field: 'qualification_checklist',
        label: 'Qualification checklist',
        reason:
          'Decision maker, genuine pain and a path to budget must all be yes. ' +
          'Without them there is no opportunity to qualify.',
      });
    }

  }

  if (nextStage === 'business_case' && !(Number(account.mrr) > 0)) {
    blockers.push({
      field: 'mrr',
      label: 'Potential MRR',
      reason: 'You cannot build a business case for an amount nobody has stated.',
    });
  }

  if (
    nextStage === 'closed_won' &&
    !contacts.some((c) => c.role_in_deal === 'decision_maker' && c.deal_engagement === 'engaged')
  ) {
    blockers.push({
      field: 'deal_coverage',
      label: 'Decision maker',
      reason:
        'Closing needs a decision maker marked engaged — they are who CS reports success to.',
    });
  }

  // Whoever approves the recurring payment has to exist before the page turns.
  // Go-live date fields shipped alongside this gate once and were dropped —
  // process that mattered, CRM overhead that did not.
  if (
    nextStage === 'closed_won' &&
    !contacts.some((c) => c.role_in_deal === 'budget_owner' && c.deal_engagement === 'engaged')
  ) {
    blockers.push({
      field: 'payment_approver',
      label: 'Payment approver',
      reason:
        'An engaged budget owner approves the recurring payment — without one the first invoice stalls after go-live.',
    });
  }

  // The RPC also accepts metadata.golive_confirmed=true as an auditable escape
  // for accounts whose usage sync has not caught up; the warning still shows
  // because the normal path is real usage.
  if (nextStage === 'pilot_running' && isBlank(account.first_usage_at)) {
    blockers.push({
      field: 'first_usage',
      label: 'First real usage',
      reason:
        'First usage means live WITH real usage — an activated account that is not using the product is a lost deal by another name.',
    });
  }

  return { nextStage, blockers };
}

/** Convenience for the common "is this one field blocking?" lookup in a row. */
export function blockerFor(
  readiness: StageReadiness,
  field: BlockerField,
): StageBlocker | undefined {
  return readiness.blockers.find((b) => b.field === field);
}
