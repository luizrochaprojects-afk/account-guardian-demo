/**
 * account_hygiene_flags — one row per (account, broken rule), at drill-down
 * grain. The counter board aggregates these client-side, so a count and the
 * accounts behind it always come from the same rows.
 *
 * Ownership of the red: the revenue owner before the close, the delivery owner
 * from the yes onward.
 */
import type { Row, Store } from '../store';
import { assertOrg } from './auth';

const DAY_MS = 86_400_000;
const PRE_CLOSE = ['working', 'discovery_call', 'qualified_opportunity', 'business_case', 'sign_off'];
const LIVE = [...PRE_CLOSE, 'closed_won', 'setup', 'pilot_running'];
const NEEDS_MRR = ['qualified_opportunity', 'business_case', 'sign_off', 'closed_won', 'setup', 'pilot_running'];
const NEEDS_MEETING = ['qualified_opportunity', 'business_case', 'sign_off', 'closed_won', 'setup'];

const SEVERITY_ORDER: Record<string, number> = {
  near_money_stalled: 0,
  next_step_overdue: 1,
  no_next_step: 2,
  no_future_meeting: 3,
  stuck_in_stage: 4,
};

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function accountHygieneFlags(store: Store, args: { _org_id: string }): Row[] {
  const orgId = args._org_id;
  assertOrg(store, orgId, 'account_hygiene_flags');

  const now = Date.now();
  const today = localDay(new Date(now));
  const staleDays =
    store.table('org_settings').find((o) => o.organization_id === orgId)?.hygiene_stale_days ?? 7;
  const profiles = new Map(store.table('profiles').map((p) => [p.user_id, p]));
  const contacts = store.table('contacts');
  const events = store.table('events');
  const openHistory = new Map(
    store
      .table('account_stage_history')
      .filter((h) => !h.exited_at && h.source !== 'backfill_events')
      .map((h) => [h.account_id, h]),
  );

  const flags: Row[] = [];
  const push = (a: Row, owner: string | null, flag: string, detail: string) =>
    flags.push({ account: a, owner, flag, detail });

  for (const a of store.table('accounts').filter((x) => x.organization_id === orgId)) {
    const stage: string = a.pipeline_stage;
    const owner = PRE_CLOSE.includes(stage) ? a.revenue_owner_id : (a.delivery_owner_id ?? a.revenue_owner_id);
    const enteredAt = openHistory.get(a.id)?.entered_at as string | undefined;
    const daysInStage = enteredAt ? Math.floor((now - Date.parse(enteredAt)) / DAY_MS) : null;
    const isLive = LIVE.includes(stage);

    // Next step = the open top-level task with the nearest due date.
    const open = store
      .table('tasks')
      .filter((t) => t.account_id === a.id && !t.parent_id && t.status !== 'done' && t.status !== 'cancelled');
    const next = open
      .filter((t) => t.due_date)
      .sort((x, y) => String(x.due_date).localeCompare(String(y.due_date)) || (x.position ?? 0) - (y.position ?? 0))[0];

    if (isLive && !next) {
      push(a, owner, 'no_next_step', open.length === 0 ? 'No next step recorded' : 'Next step has no due date');
    }
    if (isLive && next && String(next.due_date).slice(0, 10) < today) {
      const late = Math.round((Date.parse(today) - Date.parse(String(next.due_date).slice(0, 10))) / DAY_MS);
      push(a, owner, 'next_step_overdue', `${late}d overdue: ${next.name}`);
    }
    if (isLive && daysInStage !== null && daysInStage > staleDays) {
      push(a, owner, 'stuck_in_stage', `${daysInStage}d in stage (limit ${staleDays}d)`);
    }

    // Single-threading detector.
    const mine = contacts.filter((c) => c.account_id === a.id);
    const hasChampion = mine.some((c) => c.role_in_deal === 'champion');
    const needsSponsor = ['business_case', 'sign_off', 'closed_won', 'setup', 'pilot_running'].includes(stage);
    const hasSponsor = mine.some((c) => c.role_in_deal === 'decision_maker');
    if (isLive && stage !== 'working' && (!hasChampion || (needsSponsor && !hasSponsor))) {
      push(a, owner, 'missing_contact_roles', !hasChampion ? 'No champion identified' : 'No executive sponsor (decision maker) from business case on');
    }

    const missing = [
      !a.industry && 'industry',
      !a.segment && 'segment',
      !(Number(a.mrr) > 0) && NEEDS_MRR.includes(stage) && 'projected MRR',
    ].filter(Boolean);
    if (isLive && missing.length) push(a, owner, 'missing_basics', missing.join(' · '));

    if (NEEDS_MEETING.includes(stage)) {
      const hasFuture = events.some(
        (e) =>
          e.account_id === a.id &&
          e.group_label !== 'lifecycle' &&
          ((e.scheduled_at && Date.parse(e.scheduled_at) >= now) || (!e.scheduled_at && e.date && e.date >= today)),
      );
      if (!hasFuture) push(a, owner, 'no_future_meeting', 'No future meeting on the calendar');
    }

    // Near money, stalled — the hardest rule, and a same-day fix.
    if (daysInStage !== null) {
      if ((stage === 'closed_won' || stage === 'setup') && daysInStage > 2) {
        push(a, owner, 'near_money_stalled', `Signed ${daysInStage}d ago, not live yet`);
      } else if (stage === 'pilot_running' && daysInStage > 7 && !a.first_usage_at) {
        push(a, owner, 'near_money_stalled', `Live for ${daysInStage}d with no usage recorded`);
      }
    }
  }

  return flags
    .sort(
      (x, y) =>
        (SEVERITY_ORDER[x.flag] ?? 9) - (SEVERITY_ORDER[y.flag] ?? 9) ||
        String(x.account.name).localeCompare(String(y.account.name)),
    )
    .map((f) => ({
      account_id: f.account.id,
      account_name: f.account.name,
      pipeline_stage: f.account.pipeline_stage,
      flag: f.flag,
      detail: f.detail,
      owner_user_id: f.owner ?? null,
      owner_display_name: f.owner ? (profiles.get(f.owner)?.display_name ?? null) : null,
    }));
}
