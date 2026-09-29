import { describe, expect, it } from 'vitest';
import { buildSeed } from './seed';
import { Store } from './store';
import { RPC_HANDLERS } from './rpc';
import { ORG_ID } from './seed/org';
import { phaseForStage } from '@/lib/pipelineStages';

const NOW = new Date('2026-09-29T12:00:00Z');
const fresh = () => new Store(buildSeed(NOW), false);
const since = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe('demo seed', () => {
  it('is deterministic for the same moment', () => {
    expect(JSON.stringify(buildSeed(NOW))).toBe(JSON.stringify(buildSeed(NOW)));
  });

  it('keeps every foreign key pointing at a row that exists', () => {
    const t = buildSeed(NOW);
    const ids = (name: string) => new Set(t[name].map((r) => r.id));
    const accounts = ids('accounts');
    const contacts = ids('contacts');
    const events = ids('events');
    for (const name of ['contacts', 'account_stage_history', 'tasks', 'health_score_logs', 'usage_weekly', 'discovery_notes']) {
      for (const r of t[name]) expect(accounts.has(r.account_id), `${name}.${r.id}`).toBe(true);
    }
    for (const r of t.event_contacts) {
      expect(events.has(r.event_id)).toBe(true);
      expect(contacts.has(r.contact_id)).toBe(true);
    }
    for (const r of t.agent_suggestions) {
      if (r.account_id) expect(accounts.has(r.account_id)).toBe(true);
    }
  });

  it('stores a phase consistent with every stage', () => {
    for (const a of buildSeed(NOW).accounts) {
      expect(a.pipeline_phase, a.name).toBe(phaseForStage(a.pipeline_stage));
    }
  });

  it('leaves exactly one open history row per account, matching its stage', () => {
    const t = buildSeed(NOW);
    for (const a of t.accounts) {
      const open = t.account_stage_history.filter((h) => h.account_id === a.id && !h.exited_at);
      expect(open, a.name).toHaveLength(1);
      expect(open[0].to_stage).toBe(a.pipeline_stage);
    }
  });

  it('uses only reserved example domains for email', () => {
    for (const c of buildSeed(NOW).contacts) expect(c.email).toMatch(/@[a-z0-9]+\.example$/);
  });
});

describe('demo RPCs over the seed', () => {
  it('agrees with the classifier: reclassifying a fresh demo moves nothing', () => {
    const store = fresh();
    expect(store.table('account_customer_signals')).toHaveLength(6);
    const moved = RPC_HANDLERS.classify_customer_stages(store, { _org_id: ORG_ID }) as unknown[];
    expect(moved).toEqual([]);
  });

  it('moves a customer once its usage actually changes', () => {
    const store = fresh();
    const northstar = store.table('accounts').find((a) => a.name === 'Northstar Labs')!;
    // Usage collapses in the last four weeks → contracting → At Risk.
    const cutoff = Date.parse(since(28));
    store.update('usage_weekly', (u) => u.account_id === northstar.id && Date.parse(u.week_start) >= cutoff, { units: 100 });
    const moved = RPC_HANDLERS.classify_customer_stages(store, { _org_id: ORG_ID }) as { to_stage: string; rule: string }[];
    expect(moved).toEqual([expect.objectContaining({ to_stage: 'at_risk', rule: 'contracting' })]);
    const after = store.table('accounts').find((a) => a.id === northstar.id)!;
    expect(after.pipeline_stage).toBe('at_risk');
    expect(after.customer_risk_reason).toBe('contracting');
    const open = store.table('account_stage_history').filter((h) => h.account_id === northstar.id && !h.exited_at);
    expect(open).toEqual([expect.objectContaining({ to_stage: 'at_risk', source: 'classifier' })]);
  });

  it('fills the sales funnel inside the default 28-day window', () => {
    const rows = RPC_HANDLERS.dashboard_sales_funnel(fresh(), { _org_id: ORG_ID, _since: since(28) }) as { step: string; entered: number }[];
    const entered = Object.fromEntries(rows.map((r) => [r.step, r.entered]));
    expect(entered.discovery_call).toBeGreaterThan(0);
    expect(entered.sign_off).toBeGreaterThan(0);
    expect(entered.first_usage).toBeGreaterThan(0);
  });

  it('raises hygiene flags, and none for accounts that are out of the pipeline', () => {
    const store = fresh();
    const flags = RPC_HANDLERS.account_hygiene_flags(store, { _org_id: ORG_ID }) as { flag: string; pipeline_stage: string }[];
    expect(flags.length).toBeGreaterThan(3);
    expect(new Set(flags.map((f) => f.flag)).size).toBeGreaterThan(3);
    for (const f of flags) expect(['closed_lost', 'disqualified', 'churned', 'paused']).not.toContain(f.pipeline_stage);
  });

  it('counts north-star numbers from the window', () => {
    const [row] = RPC_HANDLERS.dashboard_north_star_counts(fresh(), { _org_id: ORG_ID, _since: since(28) }) as Record<string, number>[];
    expect(row.accounts_worked).toBeGreaterThan(0);
    expect(row.active_customer_count).toBe(5);
  });

  it('reports loss reasons for deals lost in the window', () => {
    const rows = RPC_HANDLERS.dashboard_loss_reasons(fresh(), { _org_id: ORG_ID, _since: since(28) }) as { loss_reason_category: string }[];
    expect(rows.map((r) => r.loss_reason_category).sort()).toEqual(['current_stack_sufficient', 'no_budget']);
  });
});

describe('seed agent mix', () => {
  it('ships 7 pending, 2 approved and 1 rejected suggestions', () => {
    const count = (s: string) => buildSeed(NOW).agent_suggestions.filter((r) => r.status === s).length;
    expect([count('pending'), count('approved'), count('rejected')]).toEqual([7, 2, 1]);
  });

  it('logs no activity against accounts nobody has started working', () => {
    const t = buildSeed(NOW);
    const targets = new Set(t.accounts.filter((a) => a.pipeline_stage === 'target').map((a) => a.id));
    expect(t.activities.filter((a) => targets.has(a.account_id))).toEqual([]);
  });
});
