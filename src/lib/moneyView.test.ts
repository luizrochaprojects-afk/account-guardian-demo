import { describe, expect, it } from 'vitest';
import { buildMoneyRows, type MoneyAccountInput } from './moneyView';
import type { HygieneFlagRow } from './hygieneCounters';

const NOW = new Date('2026-08-26T12:00:00Z').getTime();

const acc = (over: Partial<MoneyAccountInput>): MoneyAccountInput => ({
  id: 'a1',
  name: 'Account A',
  pipeline_stage: 'sign_off',
  mrr: 10_000,
  arr: 120_000,
  next_step: 'Pricing call',
  next_step_due: '2026-08-28',
  ...over,
});

const flag = (over: Partial<HygieneFlagRow>): HygieneFlagRow => ({
  accountId: 'a1',
  accountName: 'Account A',
  pipelineStage: 'sign_off',
  flag: 'no_next_step',
  detail: null,
  ownerUserId: 'u1',
  ownerDisplayName: 'Priya',
  ...over,
});

describe('buildMoneyRows', () => {
  it('keeps only money stages and orders bottom-up, then by projected MRR', () => {
    const rows = buildMoneyRows(
      [
        acc({ id: 'q', name: 'Qualified', pipeline_stage: 'qualified_opportunity' }),
        acc({ id: 't', name: 'Target, out of scope', pipeline_stage: 'target' }),
        acc({ id: 's-small', name: 'Setup small', pipeline_stage: 'setup', mrr: 5_000 }),
        acc({ id: 's-big', name: 'Setup big', pipeline_stage: 'setup', mrr: 20_000 }),
        acc({ id: 'w', name: 'Go approved', pipeline_stage: 'closed_won' }),
        acc({ id: 'ramped', name: 'Customer', pipeline_stage: 'steady' }),
      ],
      {},
      [],
      NOW,
    );

    expect(rows.map((r) => r.id)).toEqual(['s-big', 's-small', 'w', 'q']);
  });

  it('falls back to arr/12 when mrr is unset', () => {
    const rows = buildMoneyRows([acc({ mrr: null, arr: 120_000 })], {}, [], NOW);
    expect(rows[0].projectedMonthly).toBe(10_000);
  });

  it('computes days in stage from the open history row', () => {
    const rows = buildMoneyRows(
      [acc({})],
      { a1: '2026-08-20T12:00:00Z' },
      [],
      NOW,
    );
    expect(rows[0].daysInStage).toBe(6);
  });

  it('leaves days in stage null when no history row exists', () => {
    const rows = buildMoneyRows([acc({})], {}, [], NOW);
    expect(rows[0].daysInStage).toBeNull();
  });

  it('derives status from hygiene flags, worst wins', () => {
    const rows = buildMoneyRows(
      [acc({})],
      {},
      [
        flag({ flag: 'stuck_in_stage', detail: '9d in stage' }),
        flag({ flag: 'near_money_stalled', detail: '"Yes" given 4d ago, no go-live' }),
      ],
      NOW,
    );
    expect(rows[0].status).toBe('emergency');
    expect(rows[0].statusDetail).toContain('no go-live');
  });

  it('is ok when the account carries no mapped flags', () => {
    const rows = buildMoneyRows(
      [acc({})],
      {},
      [flag({ flag: 'resurrection_overdue' })],
      NOW,
    );
    expect(rows[0].status).toBe('ok');
  });
});
