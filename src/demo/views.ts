/**
 * SQL views, computed on read.
 *
 * A view in Postgres is a query with a table's name; here it is a function
 * with a table's name. `store.table('account_deal_coverage')` runs the function,
 * so a select against a view goes through the same QueryBuilder — filters,
 * ordering, counts — as a select against a table.
 */
import type { Row, Store } from './store';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Monday 00:00 UTC of the week containing `t`. */
export function weekStartUtc(t: number): number {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

/**
 * account_deal_coverage — who is engaged on each deal. Dead deals (lost,
 * disqualified, churned) keep their row but count nothing, so coverage on the
 * dashboard is about the deals still worth covering.
 */
function accountDealCoverage(store: Store): Row[] {
  const contacts = store.table('contacts');
  return store.table('accounts').map((a) => {
    const live = !a.pipeline_stage || !['disqualified', 'closed_lost', 'churned'].includes(a.pipeline_stage);
    const mine = live ? contacts.filter((c) => c.account_id === a.id) : [];
    const engaged = mine.filter((c) => c.deal_engagement === 'engaged');
    return {
      account_id: a.id,
      organization_id: a.organization_id,
      pipeline_phase: a.pipeline_phase,
      pipeline_stage: a.pipeline_stage,
      engaged_contacts_count: engaged.length,
      champion_engaged: engaged.some((c) => c.role_in_deal === 'champion'),
      decision_maker_engaged: engaged.some((c) => c.role_in_deal === 'decision_maker'),
      multi_threaded: engaged.length >= 2,
    };
  });
}

/**
 * account_customer_signals — the inputs of the customer classifier, one row per
 * live customer (plus onboarding accounts waiting on first usage).
 *
 * Usage windows are the last 4 COMPLETE weeks against the 4 before them; the
 * current, partial week is never compared with a full one.
 */
function accountCustomerSignals(store: Store): Row[] {
  const now = Date.now();
  const thisWeek = weekStartUtc(now);
  const usage = store.table('usage_weekly');
  const logs = store.table('health_score_logs');

  return store
    .table('accounts')
    .filter((a) => a.pipeline_phase === 'customer' || a.pipeline_stage === 'adoption')
    .map((a) => {
      const rows = usage.filter((u) => u.account_id === a.id);
      const inWindow = (fromWeeksAgo: number, toWeeksAgo: number) =>
        rows
          .filter((u) => {
            const t = Date.parse(u.week_start);
            return t >= thisWeek - fromWeeksAgo * WEEK_MS && t < thisWeek - toWeeksAgo * WEEK_MS;
          })
          .reduce((s, u) => s + Number(u.units || 0), 0);
      const usage4w = inWindow(4, 0);
      const usagePrev4w = inWindow(8, 4);

      const used = rows.filter((u) => Number(u.units) > 0).map((u) => Date.parse(u.week_start));
      const lastUsage = used.length ? Math.max(...used) : null;
      const weeksSinceLastUsage =
        lastUsage === null ? null : Math.max(0, Math.floor((thisWeek - lastUsage) / WEEK_MS) - 1);

      const firstUsage = a.first_usage_at ? Date.parse(a.first_usage_at) : null;
      const cohort = firstUsage === null ? null : now - firstUsage < 30 * DAY_MS ? 'M0' : 'M1+';
      const signalQuality =
        rows.length === 0 ? 'none' : firstUsage !== null && now - firstUsage < 4 * WEEK_MS ? 'partial' : 'full';

      const accountLogs = logs
        .filter((l) => l.account_id === a.id)
        .sort((x, y) => String(y.logged_at).localeCompare(String(x.logged_at)));
      const latest = accountLogs[0];
      const monthAgo = accountLogs.find((l) => now - Date.parse(l.logged_at) >= 30 * DAY_MS);

      return {
        account_id: a.id,
        organization_id: a.organization_id,
        pipeline_stage: a.pipeline_stage,
        customer_since: a.customer_since,
        first_usage_at: a.first_usage_at,
        last_usage_at: lastUsage === null ? null : new Date(lastUsage).toISOString(),
        reactivated_at: a.reactivated_at,
        customer_stage_pinned_at: a.customer_stage_pinned_at,
        usage_4w: usage4w,
        usage_prev_4w: usagePrev4w,
        usage_delta_pct: usagePrev4w > 0 ? Math.round(((usage4w - usagePrev4w) / usagePrev4w) * 1000) / 1000 : null,
        weeks_since_last_usage: weeksSinceLastUsage,
        days_since_last_activity: a.last_activity_at
          ? Math.floor((now - Date.parse(a.last_activity_at)) / DAY_MS)
          : null,
        health_score: latest ? latest.total_score : null,
        health_logged_at: latest ? latest.logged_at : null,
        health_delta_30d: latest && monthAgo ? latest.total_score - monthAgo.total_score : null,
        cohort,
        signal_quality: signalQuality,
        customer_risk_reason: a.customer_risk_reason,
      };
    });
}

/**
 * agent_cost_state — this month's model spend against the org's cap. Spend is
 * tokens used by this month's meeting extractions at a blended ~$4 per million
 * tokens, the same approximation the production view uses.
 */
function agentCostState(store: Store): Row[] {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  return store.table('agent_settings').map((s) => {
    const tokens = store
      .table('meeting_ingests')
      .filter((m) => m.organization_id === s.organization_id && Date.parse(m.created_at) >= monthStart.getTime())
      .reduce((sum, m) => sum + (Number(m.tokens_used) || 0), 0);
    const spend = Math.round((tokens / 1_000_000) * 4 * 100) / 100;
    const cap = Number(s.monthly_cost_cap_usd) || 0;
    return {
      organization_id: s.organization_id,
      monthly_cost_cap_usd: cap,
      cost_capped_at: s.cost_capped_at,
      current_month_spend_usd: spend,
      percent_of_cap: cap > 0 ? Math.round((spend / cap) * 1000) / 10 : null,
    };
  });
}

export const VIEWS: Record<string, (store: Store) => Row[]> = {
  account_deal_coverage: accountDealCoverage,
  account_customer_signals: accountCustomerSignals,
  agent_cost_state: agentCostState,
};
