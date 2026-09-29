/**
 * revert_lifecycle_on_delete — deleting the LATEST stage event from an
 * account's timeline rolls the account back to the stage before it, and
 * un-stamps whatever that later stage had stamped. Deleting an older event
 * changes nothing but the timeline.
 *
 * Called before the event row is deleted, so it can still read it.
 */
import type { Store } from '../store';
import { DbError, withSetting } from '../runtime';
import { phaseForStage, stageRank, ALL_STAGES_ORDERED, type PipelineStage } from '@/lib/pipelineStages';
import { getUserOrgId } from './auth';

export function revertLifecycleOnDelete(store: Store, args: { _event_id: string }): null {
  const events = store.table('events');
  const event = events.find((e) => e.id === args._event_id && e.group_label === 'lifecycle');
  if (!event?.account_id) return null;
  if (getUserOrgId(store) !== event.organization_id) throw new DbError('Not authorized');

  const lifecycle = events.filter(
    (e) => e.account_id === event.account_id && e.group_label === 'lifecycle' && e.id !== event.id,
  );
  if (lifecycle.some((e) => e.created_at > event.created_at)) return null;

  const previous = lifecycle
    .filter((e) => e.created_at < event.created_at)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const text = previous?.title?.startsWith('Stage: ') ? previous.title.slice(7) : null;
  const prevStage = text && (ALL_STAGES_ORDERED as readonly string[]).includes(text) ? (text as PipelineStage) : null;
  // Nothing to roll back to: deleting the only stage event must not knock the
  // account off the board.
  if (!prevStage) return null;

  // Phase, not rank: rank is null for the customer states (expanding, at_risk,
  // churned), and treating those as "before the close" would erase the stamps
  // of an account that was already a customer.
  const prevPhase = prevStage ? phaseForStage(prevStage) : null;
  const postClose = prevPhase === 'onboarding' || prevPhase === 'customer';
  const isCustomer = prevPhase === 'customer';
  const keepApproval = postClose || (prevStage ? (stageRank(prevStage) ?? 0) >= 4 : false);

  withSetting('app.suppress_lifecycle_log', 'on', () =>
    withSetting('app.system_stage_advance', 'true', () => {
      const [account] = store.table('accounts').filter((a) => a.id === event.account_id);
      if (!account) return;
      store.update('accounts', (a) => a.id === event.account_id, {
        pipeline_stage: prevStage,
        pipeline_phase: prevPhase,
        customer_since: postClose ? account.customer_since : null,
        expected_close_date: postClose ? account.expected_close_date : null,
        founder_approved_at: keepApproval ? account.founder_approved_at : null,
        founder_approved_by: keepApproval ? account.founder_approved_by : null,
        customer_stage_pinned_at: isCustomer ? account.customer_stage_pinned_at : null,
        customer_stage_pinned_by: isCustomer ? account.customer_stage_pinned_by : null,
        customer_stage_pin_reason: isCustomer ? account.customer_stage_pin_reason : null,
      });
    }),
  );
  return null;
}
