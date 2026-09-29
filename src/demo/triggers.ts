/**
 * The triggers the app's behaviour depends on, ported from Postgres.
 *
 * Each one is the TypeScript twin of a trigger in supabase/schema.sql. They run
 * inside the store's write methods with the same timing: `insert`/`update` are
 * BEFORE triggers (they can rewrite the row or abort the write by throwing),
 * `after_*` triggers see the committed row and may write to other tables.
 *
 * Not ported: pure `updated_at` touch triggers (the store stamps updated_at
 * itself) and triggers for features the portfolio edition does not include.
 */
import type { Row, Store } from './store';
import { DbError, session } from './runtime';
import { phaseForStage } from '@/lib/pipelineStages';

export type TriggerEvent = 'insert' | 'update' | 'after_insert' | 'after_update' | 'after_delete';

const DAY_MS = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);

// ── accounts ────────────────────────────────────────────────────────────────

/** generate_account_code_prefix: ACME, ACME2, … unique per organization. */
function generateCodePrefix(store: Store, row: Row): Row {
  if (row.code_prefix) {
    row.code_prefix = String(row.code_prefix).replace(/[^A-Za-z0-9]/g, '').toUpperCase() || null;
  }
  if (!row.code_prefix) {
    const base = (String(row.name ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'ACC').slice(0, 4);
    const taken = new Set(
      store.table('accounts').filter((a) => a.organization_id === row.organization_id).map((a) => a.code_prefix),
    );
    let candidate = base;
    let suffix = 2;
    while (taken.has(candidate)) candidate = `${base}${suffix++}`;
    row.code_prefix = candidate;
  }
  return row;
}

/** guard_pipeline_stage_writes: the stage only moves through transition_stage. */
function guardPipelineStage(row: Row, before: Row) {
  if (row.pipeline_stage === before.pipeline_stage) return;
  if (session.get('app.transition_stage_active') === 'true') return;
  if (session.get('app.system_stage_advance') === 'true') return;
  throw new DbError('pipeline_stage may only be changed via public.transition_stage()', '42501');
}

/** log_lifecycle_change: every stage move leaves an event on the timeline. */
function logLifecycleChange(store: Store, row: Row, before: Row) {
  if (session.get('app.suppress_lifecycle_log') === 'on') return;
  if (row.pipeline_stage === before.pipeline_stage || !row.pipeline_stage) return;
  store.insert('events', [
    {
      account_id: row.id,
      organization_id: row.organization_id,
      user_id: session.get('app.user_id') ?? row.organization_id,
      type: 'system',
      channel: 'system',
      direction: 'internal',
      title: `Stage: ${row.pipeline_stage}`,
      summary: before.pipeline_stage
        ? `Moved from ${before.pipeline_stage} to ${row.pipeline_stage}`
        : `Stage set to ${row.pipeline_stage}`,
      group_label: 'lifecycle',
      date: today(),
    },
  ]);
  if (row.pipeline_stage === 'closed_won' && !row.customer_since) row.customer_since = today();
}

/** sync_account_stage_history: close the open row, open a new one. */
function syncStageHistory(store: Store, row: Row, before: Row | null) {
  if (before && before.pipeline_stage === row.pipeline_stage) return;
  const at = new Date().toISOString();
  const closeOpen = () =>
    store.update(
      'account_stage_history',
      (h) => h.account_id === row.id && !h.exited_at,
      { exited_at: at },
    );
  if (!row.pipeline_stage) {
    closeOpen();
    return;
  }
  closeOpen();
  const source =
    session.get('app.transition_stage_active') === 'true'
      ? 'transition_stage'
      : session.get('app.customer_classifier_active') === 'true'
        ? 'classifier'
        : 'system';
  const metadata: Row = {};
  for (const k of ['loss_reason_category', 'disqualify_reason', 'churn_reason', 'loss_reason_detail', 'lost_from_stage', 'customer_risk_reason']) {
    if (row[k] != null) metadata[k] = row[k];
  }
  if (source === 'transition_stage' && row.customer_stage_pin_reason) metadata.pin_reason = row.customer_stage_pin_reason;
  store.insert('account_stage_history', [
    {
      organization_id: row.organization_id,
      account_id: row.id,
      from_stage: before?.pipeline_stage ?? null,
      to_stage: row.pipeline_stage,
      from_phase: before?.pipeline_phase ?? null,
      to_phase: row.pipeline_phase ?? phaseForStage(row.pipeline_stage),
      entered_at: at,
      changed_by: session.get('app.user_id') ?? null,
      source,
      arr_at_entry: row.arr ?? null,
      metadata,
    },
  ]);
}

// ── tasks / notes / activities ──────────────────────────────────────────────

/** assign_task_code: ACME-7, numbered per account. */
function assignTaskCode(store: Store, row: Row): Row {
  if (!row.account_id && row.milestone_id) {
    const milestone = store.table('milestones').find((m) => m.id === row.milestone_id);
    const project = milestone && store.table('projects').find((p) => p.id === milestone.project_id);
    row.account_id = project?.account_id ?? null;
  }
  if (!row.account_id) return row;
  const account = store.table('accounts').find((a) => a.id === row.account_id);
  if (!account?.code_prefix) return row;
  if (row.code_number == null) {
    const max = store
      .table('tasks')
      .filter((t) => t.account_id === row.account_id)
      .reduce((m, t) => Math.max(m, Number(t.code_number) || 0), 0);
    row.code_number = max + 1;
  }
  row.code = `${account.code_prefix}-${row.code_number}`;
  return row;
}

/** lock_created_by_agent: agent provenance cannot be rewritten after the fact. */
function lockAgentProvenance(row: Row, before: Row) {
  if (row.created_by_agent !== before.created_by_agent) throw new DbError('created_by_agent is immutable');
  if (row.source_suggestion_id !== before.source_suggestion_id) throw new DbError('source_suggestion_id is immutable');
}

/** sync_next_step_from_task: the account's next step mirrors its next_step task. */
function syncNextStep(store: Store, row: Row) {
  if (row.category !== 'next_step' || !row.account_id) return;
  if (row.status === 'done' || row.status === 'cancelled') {
    store.update('accounts', (a) => a.id === row.account_id && a.next_step_task_id === row.id, {
      next_step: null,
      next_step_due: null,
      next_step_task_id: null,
    });
  } else {
    store.update('accounts', (a) => a.id === row.account_id, {
      next_step: row.name,
      next_step_due: row.due_date ?? null,
      next_step_task_id: row.id,
    });
  }
}

function clearNextStepOnDelete(store: Store, row: Row) {
  if (row.category !== 'next_step' || !row.account_id) return;
  store.update('accounts', (a) => a.id === row.account_id && a.next_step_task_id === row.id, {
    next_step: null,
    next_step_due: null,
    next_step_task_id: null,
  });
}

/** touch_account_activity: notes, tasks and stage moves bump last_activity_at. */
function touchAccount(store: Store, accountId: string | null | undefined, at: string | null | undefined) {
  if (!accountId) return;
  const ts = at ?? new Date().toISOString();
  store.update(
    'accounts',
    (a) =>
      a.id === accountId &&
      (!a.last_activity_at || a.last_activity_at < ts) &&
      (a.pipeline_stage !== 'closed_lost' || a.loss_reason_category != null),
    { last_activity_at: ts },
  );
}

/** activities_touch_account_markers: first-worked / first-meeting / last-activity stamps. */
function touchActivityMarkers(store: Store, row: Row) {
  if (!row.account_id) return;
  const account = store.table('accounts').find((a) => a.id === row.account_id);
  if (!account) return;
  const at: string = row.occurred_at;
  const earliest = (current: string | null) => (current && current < at ? current : at);
  const latest = (current: string | null) => (current && current > at ? current : at);
  const patch: Row = {
    first_worked_at: earliest(account.first_worked_at),
    last_activity_at: latest(account.last_activity_at),
  };
  if (row.meaningful_engagement) patch.first_engaged_at = earliest(account.first_engaged_at);
  if (row.activity_type === 'meeting_held' || row.activity_type === 'demo') {
    patch.first_meeting_at = earliest(account.first_meeting_at);
  }
  store.update('accounts', (a) => a.id === row.account_id, patch);
}

/** sync_account_health_score: the account carries its latest logged score. */
function syncHealthScore(store: Store, accountId: string) {
  const latest = store
    .table('health_score_logs')
    .filter((l) => l.account_id === accountId)
    .sort((a, b) => (b.logged_at ?? '').localeCompare(a.logged_at ?? '') || (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
  store.update('accounts', (a) => a.id === accountId, { health_score: latest?.total_score ?? 0 });
}

// ── foreign keys ────────────────────────────────────────────────────────────

/** ON DELETE CASCADE / SET NULL, as declared on `accounts` in supabase/schema.sql. */
const ACCOUNT_CASCADE = ['contacts', 'events', 'activities', 'tasks', 'account_stage_history', 'discovery_notes', 'health_score_logs', 'usage_weekly'];
const ACCOUNT_SET_NULL = ['agent_suggestions', 'agent_audit_log', 'notes'];

function deleteAccountChildren(store: Store, row: Row) {
  for (const t of ACCOUNT_CASCADE) store.remove(t, (r) => r.account_id === row.id);
  for (const t of ACCOUNT_SET_NULL) store.update(t, (r) => r.account_id === row.id, { account_id: null });
}

// ── dispatch ────────────────────────────────────────────────────────────────

export function runTriggers(store: Store, table: string, event: TriggerEvent, row: Row, before: Row | null): Row {
  switch (table) {
    case 'accounts':
      if (event === 'insert') {
        // derive_pipeline_phase: the phase always follows the stage.
        if (row.pipeline_stage) row.pipeline_phase = phaseForStage(row.pipeline_stage);
        return generateCodePrefix(store, row);
      }
      if (event === 'update' && before) {
        guardPipelineStage(row, before);
        logLifecycleChange(store, row, before);
      }
      if (event === 'after_insert') syncStageHistory(store, row, null);
      if (event === 'after_update') syncStageHistory(store, row, before);
      if (event === 'after_delete') deleteAccountChildren(store, row);
      return row;

    case 'events':
    case 'contacts':
      if (event === 'after_delete') {
        const key = table === 'events' ? 'event_id' : 'contact_id';
        store.remove('event_contacts', (ec) => ec[key] === row.id);
      }
      return row;

    case 'account_stage_history':
      if (event === 'update' && row.exited_at && !before?.exited_at) {
        row.duration_hours = Math.round(((Date.parse(row.exited_at) - Date.parse(row.entered_at)) / 3_600_000) * 10) / 10;
      }
      if (event === 'after_insert') touchAccount(store, row.account_id, row.entered_at);
      return row;

    case 'tasks':
      if (event === 'insert') return assignTaskCode(store, row);
      if (event === 'update' && before) lockAgentProvenance(row, before);
      if (event === 'after_insert' || event === 'after_update') {
        const nextStepFieldsChanged =
          !before || ['name', 'due_date', 'status', 'category'].some((k) => row[k] !== before[k]);
        if (nextStepFieldsChanged) syncNextStep(store, row);
        touchAccount(store, row.account_id, row.updated_at);
      }
      if (event === 'after_delete') clearNextStepOnDelete(store, row);
      return row;

    case 'notes':
      if (event === 'update' && before) lockAgentProvenance(row, before);
      if (event === 'after_insert' || event === 'after_update') touchAccount(store, row.account_id, row.updated_at);
      return row;

    case 'activities':
      if (event === 'after_insert') touchActivityMarkers(store, row);
      return row;

    case 'health_score_logs':
      if (event === 'after_insert' || event === 'after_update' || event === 'after_delete') {
        syncHealthScore(store, row.account_id);
      }
      return row;

    default:
      return row;
  }
}

export { DAY_MS };
