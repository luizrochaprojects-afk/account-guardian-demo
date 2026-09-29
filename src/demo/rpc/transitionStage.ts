/**
 * transition_stage — the only way an account's pipeline stage moves.
 *
 * TypeScript port of the SQL function in supabase/schema.sql, rule for rule.
 * The one difference: in production the qualification gates exist twice (here,
 * and mirrored in src/lib/stageReadiness.ts so the UI can warn while you type).
 * The demo has no second runtime, so this port reads the item lists from that
 * module instead of restating them.
 *
 * Every refusal raises with the same message and SQLSTATE as the database, so
 * the UI's error handling is exercised exactly as in production.
 */
import type { Row, Store } from '../store';
import { DbError, withSetting } from '../runtime';
import { phaseForStage, stageRank, type PipelineStage } from '@/lib/pipelineStages';
import { QUALIFICATION_AFFIRMATIVE_ITEMS, QUALIFICATION_REQUIRED_ITEMS } from '@/lib/stageReadiness';
import { callerProfile } from './auth';

const FOUNDER_ONLY: PipelineStage[] = ['qualified_opportunity', 'sign_off', 'closed_won'];
const today = () => new Date().toISOString().slice(0, 10);

function answer(checklist: unknown, key: string): string | undefined {
  if (!checklist || typeof checklist !== 'object') return undefined;
  const item = (checklist as Row)[key];
  if (!item || typeof item !== 'object') return undefined;
  const a = (item as Row).answer;
  return a === true ? 'true' : a === false ? 'false' : undefined;
}

export function transitionStage(
  store: Store,
  args: { p_account_id: string; p_new_stage: PipelineStage; p_metadata?: Row },
): Row {
  const { p_account_id: accountId, p_new_stage: next } = args;
  const meta: Row = args.p_metadata ?? {};
  const caller = callerProfile(store);

  const account = store.table('accounts').find((a) => a.id === accountId);
  if (!account) throw new DbError(`transition_stage: account ${accountId} not found`, 'P0002');
  if (account.organization_id !== caller.organization_id) {
    throw new DbError('transition_stage: cross-tenant access denied', '42501');
  }

  const current = account.pipeline_stage as PipelineStage | null;
  const oldPhase = account.pipeline_phase;
  const newPhase = phaseForStage(next);

  if (FOUNDER_ONLY.includes(next) && caller.role !== 'founder') {
    throw new DbError(`transition_stage: ${next} requires founder role`, '42501');
  }

  let checklist = account.qualification_checklist;
  if (next === 'qualified_opportunity') {
    for (const item of QUALIFICATION_REQUIRED_ITEMS) {
      const a = answer(checklist, item);
      if (a !== 'true' && a !== 'false') {
        throw new DbError(`transition_stage: qualification item ${item} unanswered`, 'P0001');
      }
    }
    // An explicit "no" is a fine answer for most items. Not for these three: no
    // decision maker, no genuine pain, or no path to budget means there is no
    // opportunity, whatever the other answers say.
    for (const item of QUALIFICATION_AFFIRMATIVE_ITEMS) {
      if (answer(checklist, item) !== 'true') {
        throw new DbError(
          `transition_stage: qualified_opportunity requires ${item} to be answered yes, not just answered`,
          'P0001',
        );
      }
    }
    checklist = {
      ...(checklist ?? {}),
      founder_approved: { answer: true, approver_id: caller.user_id, approved_at: new Date().toISOString() },
    };
  }

  // Stage order. A jump like target → sign_off would write a clean history row
  // that quietly poisons every conversion number computed from that history.
  // Unranked stages (paused, disqualified, closed_lost, expanding, at_risk,
  // churned) stay unconstrained by design — a deal has to be able to die from
  // anywhere.
  const fromRank = current ? stageRank(current) : null;
  const toRank = stageRank(next);
  if (fromRank !== null && toRank !== null && toRank > fromRank + 1) {
    throw new DbError(
      `transition_stage: cannot skip from ${current} to ${next} -- advance one stage at a time`,
      'P0001',
    );
  }

  // You cannot build a business case for an amount nobody has stated.
  if (next === 'business_case' && !(Number(account.mrr) > 0)) {
    throw new DbError(
      'transition_stage: business_case requires accounts.mrr > 0 -- state the deal size before building the case',
      'P0001',
    );
  }

  const contacts = store.table('contacts').filter((c) => c.account_id === accountId);
  // Whoever CS reports success to has to exist before the page turns.
  if (
    next === 'closed_won' &&
    !contacts.some((c) => c.role_in_deal === 'decision_maker' && c.deal_engagement === 'engaged')
  ) {
    throw new DbError(
      'transition_stage: closed_won requires at least one contact with role_in_deal=decision_maker and deal_engagement=engaged',
      'P0001',
    );
  }
  // The engaged budget owner approves the recurring payment; without one, the
  // first invoice stalls after go-live.
  if (
    next === 'closed_won' &&
    !contacts.some((c) => c.role_in_deal === 'budget_owner' && c.deal_engagement === 'engaged')
  ) {
    throw new DbError(
      'transition_stage: closed_won requires an engaged budget_owner contact -- who approves the recurring payment before go-live',
      'P0001',
    );
  }

  // First real usage is the real close: a signature without usage is a promise.
  // metadata.golive_confirmed=true is the auditable escape for accounts whose
  // usage sync has not caught up (it lands in account_stage_history.metadata).
  if (next === 'pilot_running' && !account.first_usage_at && String(meta.golive_confirmed ?? '') !== 'true') {
    throw new DbError(
      'transition_stage: pilot_running means live WITH real usage -- wait for first_usage_at, or pass metadata.golive_confirmed=true if usage is confirmed outside the sync',
      'P0001',
    );
  }

  if (next === 'closed_lost' && !meta.loss_reason_category) {
    throw new DbError('transition_stage: closed_lost requires loss_reason_category', '23514');
  }
  if (next === 'disqualified' && !meta.disqualify_reason) {
    throw new DbError('transition_stage: disqualified requires disqualify_reason', '23514');
  }
  if (next === 'churned' && !meta.churn_reason) {
    throw new DbError('transition_stage: churned requires churn_reason', '23514');
  }

  // In the Customer phase the classifier owns the column; a human move is an
  // override and has to say why.
  if (newPhase === 'customer' && next !== 'churned' && !String(meta.pin_reason ?? '').trim()) {
    throw new DbError(`transition_stage: moving to ${next} requires metadata.pin_reason`, '23514');
  }

  const now = new Date().toISOString();
  const lost = next === 'closed_lost' || next === 'disqualified' || next === 'churned';
  const patch: Row = {
    pipeline_stage: next,
    pipeline_phase: newPhase,
    founder_approved_at: next === 'qualified_opportunity' ? now : account.founder_approved_at,
    founder_approved_by: next === 'qualified_opportunity' ? caller.user_id : account.founder_approved_by,
    qualification_checklist: next === 'qualified_opportunity' ? checklist : account.qualification_checklist,
    customer_since: next === 'closed_won' && !account.customer_since ? today() : account.customer_since,
    golive_at: next === 'pilot_running' && !account.golive_at ? now : account.golive_at,
    expected_close_date:
      oldPhase === 'sales' && (newPhase === 'onboarding' || newPhase === 'customer') && !account.expected_close_date
        ? today()
        : account.expected_close_date,
    customer_stage_pinned_at: newPhase === 'customer' ? now : account.customer_stage_pinned_at,
    customer_stage_pinned_by: newPhase === 'customer' ? caller.user_id : account.customer_stage_pinned_by,
    customer_stage_pin_reason:
      newPhase === 'customer' ? (meta.pin_reason ?? account.customer_stage_pin_reason) : account.customer_stage_pin_reason,
    customer_risk_reason: newPhase === 'customer' && next !== 'at_risk' ? null : account.customer_risk_reason,
    loss_reason_category: next === 'closed_lost' ? meta.loss_reason_category : account.loss_reason_category,
    disqualify_reason: next === 'disqualified' ? meta.disqualify_reason : account.disqualify_reason,
    churn_reason: next === 'churned' ? meta.churn_reason : account.churn_reason,
    loss_reason_detail: lost ? (meta.loss_reason_detail ?? account.loss_reason_detail) : account.loss_reason_detail,
    lost_from_stage: lost ? current : account.lost_from_stage,
  };

  const [updated] = withSetting('app.transition_stage_active', 'true', () =>
    store.update('accounts', (a) => a.id === accountId, patch),
  );
  return updated;
}
