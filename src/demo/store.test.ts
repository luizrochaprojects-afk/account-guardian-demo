import { describe, expect, it } from 'vitest';
import { buildSeed } from './seed';
import { Store } from './store';
import { QueryBuilder } from './query';
import { RPC_HANDLERS } from './rpc';

const NOW = new Date('2026-09-29T12:00:00Z');
const fresh = () => new Store(buildSeed(NOW), false);
const meridianOf = (s: Store) => s.table('accounts').find((a) => a.name === 'Meridian Health')!;

describe('deleting an account follows the schema foreign keys', () => {
  it('cascades to owned rows and detaches shared ones', () => {
    const store = fresh();
    const id = meridianOf(store).id;
    const owned = ['contacts', 'events', 'activities', 'tasks', 'account_stage_history', 'discovery_notes', 'health_score_logs', 'usage_weekly'];
    expect(owned.some((t) => store.table(t).some((r) => r.account_id === id))).toBe(true);
    const suggestions = store.table('agent_suggestions').filter((s) => s.account_id === id).map((s) => s.id);
    expect(suggestions.length).toBeGreaterThan(0);

    store.remove('accounts', (a) => a.id === id);

    for (const t of owned) expect(store.table(t).filter((r) => r.account_id === id), t).toEqual([]);
    const eventIds = new Set(store.table('events').map((e) => e.id));
    for (const ec of store.table('event_contacts')) expect(eventIds.has(ec.event_id)).toBe(true);
    // Suggestions, audit rows and notes survive, detached: the agent's work is
    // still on record, it just no longer points at a deleted account.
    for (const sid of suggestions) {
      expect(store.table('agent_suggestions').find((s) => s.id === sid)?.account_id).toBeNull();
    }
    expect(store.table('agent_audit_log').some((r) => r.account_id === id)).toBe(false);
    expect(store.table('notes').some((n) => n.account_id === id)).toBe(false);
  });
});

describe('query semantics that match Postgres', () => {
  const store = () => new Store({ t: [{ id: '1', v: 'a' }, { id: '2', v: null }, { id: '3', v: 'b' }] }, false);

  it('NOT (col = x) drops NULL rows, like SQL', async () => {
    const { data } = await new QueryBuilder(store(), 't').select('id').not('v', 'eq', 'a');
    expect(data.map((r: { id: string }) => r.id)).toEqual(['3']);
  });

  it('a negated term inside or() also drops NULL rows', async () => {
    const { data } = await new QueryBuilder(store(), 't').select('id').or('v.not.eq.a');
    expect(data.map((r: { id: string }) => r.id)).toEqual(['3']);
  });

  it('upsert never treats NULL keys as a conflict', () => {
    const s = new Store({ t: [{ id: '1', k: null, v: 1 }] }, false);
    s.upsert('t', [{ id: '2', k: null, v: 2 }], ['k'], false);
    expect(s.table('t')).toHaveLength(2);
  });
});

describe('revert_lifecycle_on_delete', () => {
  it('leaves the stage alone when the deleted event is the only one', () => {
    const store = fresh();
    const redwood = store.table('accounts').find((a) => a.name === 'Redwood Legal')!;
    const only = store.table('events').filter((e) => e.account_id === redwood.id && e.group_label === 'lifecycle');
    expect(only).toHaveLength(1);
    RPC_HANDLERS.revert_lifecycle_on_delete(store, { _event_id: only[0].id });
    expect(store.table('accounts').find((a) => a.id === redwood.id)?.pipeline_stage).toBe('target');
  });
});

describe('saved edits', () => {
  it('are dropped after a day, so a returning visitor gets fresh relative dates', async () => {
    const { createStore } = await import('./store');
    const { SEED_VERSION } = await import('./seed');
    const stale = { version: SEED_VERSION, savedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), tables: { accounts: [] } };
    localStorage.setItem('account-guardian-demo:db', JSON.stringify(stale));
    const store = createStore({ persist: true });
    expect(store.table('accounts').length).toBeGreaterThan(0);
    expect(localStorage.getItem('account-guardian-demo:db')).toBeNull();
  });

  it('are kept within the day', async () => {
    const { createStore } = await import('./store');
    const { SEED_VERSION } = await import('./seed');
    const recent = { version: SEED_VERSION, savedAt: new Date().toISOString(), tables: { accounts: [] } };
    localStorage.setItem('account-guardian-demo:db', JSON.stringify(recent));
    expect(createStore({ persist: true }).table('accounts')).toEqual([]);
    localStorage.clear();
  });
});
