/**
 * The dashboard RPCs, ported from SQL. All three read account_stage_history —
 * the log of every stage move — so "what happened in this window" is answered
 * from observed transitions, never from where accounts happen to sit today.
 */
import type { Row, Store } from '../store';
import { stageRank, type PipelineStage } from '@/lib/pipelineStages';
import { assertOrg } from './auth';

const DAY_MS = 86_400_000;
const SPINE: PipelineStage[] = ['working', 'discovery_call', 'qualified_opportunity', 'business_case', 'sign_off'];
const LIVE_AFTER_CLOSE: PipelineStage[] = ['pilot_running', 'pilot_review', 'adoption', 'ramping', 'steady', 'expanding', 'at_risk'];

const t = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

/** Observed moves inside the window. Backfilled history is not activity. */
function windowMoves(store: Store, orgId: string, since: string): Row[] {
  const from = t(since);
  return store
    .table('account_stage_history')
    .filter((h) => h.organization_id === orgId && t(h.entered_at) >= from && h.source !== 'backfill_events');
}

/** percentile_cont(0.5) — interpolated median, or null on an empty set. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = (s.length - 1) / 2;
  const lo = Math.floor(mid);
  const hi = Math.ceil(mid);
  return s[lo] + (s[hi] - s[lo]) * (mid - lo);
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

export function dashboardNorthStarCounts(store: Store, args: { _org_id: string; _since: string }): Row[] {
  assertOrg(store, args._org_id, 'dashboard_north_star_counts');
  const moves = windowMoves(store, args._org_id, args._since);
  const distinct = (stage?: PipelineStage) =>
    new Set(moves.filter((m) => !stage || m.to_stage === stage).map((m) => m.account_id)).size;
  return [
    {
      accounts_worked: distinct(),
      working_count: distinct('working'),
      discovery_call_count: distinct('discovery_call'),
      qualified_opp_count: distinct('qualified_opportunity'),
      signoff_count: distinct('sign_off'),
      active_customer_count: store
        .table('accounts')
        .filter((a) => a.organization_id === args._org_id && a.pipeline_phase === 'customer' && a.pipeline_stage !== 'churned')
        .length,
    },
  ];
}

export function dashboardLossReasons(store: Store, args: { _org_id: string; _since: string }): Row[] {
  assertOrg(store, args._org_id, 'dashboard_loss_reasons');
  const accounts = new Map(store.table('accounts').map((a) => [a.id, a]));
  const groups = new Map<string, { category: string; stage: string; ids: Set<string> }>();
  for (const h of windowMoves(store, args._org_id, args._since)) {
    if (h.to_stage !== 'closed_lost') continue;
    const a = accounts.get(h.account_id);
    if (!a?.loss_reason_category) continue;
    const stage = h.from_stage ?? a.lost_from_stage;
    const key = `${a.loss_reason_category}|${stage}`;
    const g = groups.get(key) ?? { category: a.loss_reason_category, stage, ids: new Set<string>() };
    g.ids.add(a.id);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({
    loss_reason_category: g.category,
    lost_from_stage: g.stage,
    account_count: g.ids.size,
  }));
}

/**
 * The sales funnel, FLOW semantics: per spine step, the cohort that ENTERED it
 * inside the window; converted = later reached a stage AT OR BEYOND the next
 * one (skipping a stage is not a loss). The last step is won = first real usage
 * inside the window, not closed_won.
 *
 * `_include_legacy` adds a current-state backstop for accounts whose passage
 * through the spine predates the window. It changes what the numbers mean, so
 * it is off unless someone asks.
 */
export function dashboardSalesFunnel(
  store: Store,
  args: { _org_id: string; _since: string; _include_legacy?: boolean },
): Row[] {
  const orgId = args._org_id;
  assertOrg(store, orgId, 'dashboard_sales_funnel');
  const since = t(args._since);
  const accounts = store.table('accounts').filter((a) => a.organization_id === orgId);
  const byId = new Map(accounts.map((a) => [a.id, a]));

  // First forward entry per account per stage inside the window.
  const firstEntry = new Map<string, { account_id: string; stage: PipelineStage; rank: number; at: number }>();
  for (const h of windowMoves(store, orgId, args._since)) {
    const rank = stageRank(h.to_stage);
    if (rank === null) continue;
    const key = `${h.account_id}|${h.to_stage}`;
    const at = t(h.entered_at);
    const prev = firstEntry.get(key);
    if (!prev || at < prev.at) firstEntry.set(key, { account_id: h.account_id, stage: h.to_stage, rank, at });
  }
  const entries = [...firstEntry.values()];

  const wins = accounts.filter((a) => t(a.first_usage_at) >= since);
  const legacy = args._include_legacy
    ? accounts.filter((a) => a.first_usage_at || LIVE_AFTER_CLOSE.includes(a.pipeline_stage))
    : [];
  const legacyIds = new Set(legacy.map((a) => a.id));

  type Measured = { step: PipelineStage; rank: number; arr: number; mrr: number; converted: boolean; days: number | null };
  const measured: Measured[] = [];

  for (const e of entries) {
    if (!SPINE.includes(e.stage)) continue;
    const a = byId.get(e.account_id);
    if (!a) continue;
    let nextAt: number | null = null;
    if (e.stage === 'sign_off') {
      // The step after the commercial yes is real usage, not closed_won.
      const fu = t(a.first_usage_at);
      nextAt = fu >= e.at ? fu : null;
    } else {
      const later = entries
        .filter((n) => n.account_id === e.account_id && n.rank >= e.rank + 1 && n.at >= e.at)
        .map((n) => n.at);
      nextAt = later.length ? Math.min(...later) : null;
    }
    measured.push({
      step: e.stage,
      rank: e.rank,
      arr: Number(a.arr) || 0,
      mrr: Number(a.mrr) || 0,
      converted: nextAt !== null || legacyIds.has(a.id),
      days: nextAt !== null ? (nextAt - e.at) / DAY_MS : null,
    });
  }

  // Backstop: legacy accounts with no visible windowed entry count as one
  // entered + converted unit in each spine step.
  for (const a of legacy) {
    for (const stage of SPINE) {
      if (entries.some((e) => e.account_id === a.id && e.stage === stage)) continue;
      measured.push({
        step: stage,
        rank: stageRank(stage) as number,
        arr: Number(a.arr) || 0,
        mrr: Number(a.mrr) || 0,
        converted: true,
        days: null,
      });
    }
  }

  const rows: Row[] = [];
  for (const stage of SPINE) {
    const group = measured.filter((m) => m.step === stage);
    if (group.length === 0) continue;
    const converted = group.filter((m) => m.converted).length;
    const med = median(group.map((m) => m.days).filter((d): d is number => d !== null));
    rows.push({
      step: stage,
      step_order: (stageRank(stage) as number) - 1,
      entered: group.length,
      arr_total: group.reduce((s, m) => s + m.arr, 0),
      current_mrr_total: group.reduce((s, m) => s + m.mrr, 0),
      converted,
      conversion_rate: round(converted / group.length, 4),
      median_days_to_next: med === null ? null : round(med, 1),
    });
  }

  const won = new Map<string, Row>();
  for (const a of [...wins, ...legacy]) won.set(a.id, a);
  rows.push({
    step: 'first_usage',
    step_order: 6,
    entered: won.size,
    arr_total: [...won.values()].reduce((s, a) => s + (Number(a.arr) || 0), 0),
    current_mrr_total: [...won.values()].reduce((s, a) => s + (Number(a.mrr) || 0), 0),
    converted: null,
    conversion_rate: null,
    median_days_to_next: null,
  });

  return rows.sort((a, b) => a.step_order - b.step_order);
}
