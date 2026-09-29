import { describe, it, expect } from 'vitest';
import {
  netUsageRetention,
  grossUsageRetention,
  summarizeCustomerPortfolio,
  enteredRiskSince,
  topUsageDrops,
  compactAmount,
  formatRatio,
} from './customerPortfolio';
import { DAY_MS, DEFAULT_CUSTOMER_THRESHOLDS, type CustomerSignals } from './customerSignals';

function acc(over: Partial<CustomerSignals> & { accountId: string }): CustomerSignals {
  return {
    pipelineStage: 'steady',
    customerSince: null,
    firstUsageAt: null,
    lastUsageAt: null,
    reactivatedAt: null,
    customerStagePinnedAt: null,
    usage4w: 0,
    usagePrev4w: 0,
    usageDeltaPct: null,
    weeksSinceLastUsage: null,
    daysSinceLastActivity: null,
    healthScore: null,
    healthLoggedAt: null,
    cohort: 'M1+',
    signalQuality: 'full',
    ...over,
  };
}

describe('net usage retention', () => {
  it('is flat when nothing changed', () => {
    const r = netUsageRetention([
      acc({ accountId: 'a', usage4w: 1000, usagePrev4w: 1000 }),
      acc({ accountId: 'b', usage4w: 500, usagePrev4w: 500 }),
    ]);
    expect(r.rate).toBe(1);
    expect(r.numerator).toBe(1500);
    expect(r.denominator).toBe(1500);
    expect(r.sampleSize).toBe(2);
  });

  /**
   * The bug this test exists to prevent: a brand-new customer has no previous
   * window, so counting its usage would inflate the numerator against a
   * denominator it never contributed to — and retention would rise every time
   * sales closed a deal. That is a growth metric, not a retention metric.
   */
  it('excludes accounts that did not exist in the previous window', () => {
    const r = netUsageRetention([
      acc({ accountId: 'old', usage4w: 1000, usagePrev4w: 1000 }),
      acc({ accountId: 'brand-new', usage4w: 9999, usagePrev4w: 0 }),
    ]);
    expect(r.rate).toBe(1);
    expect(r.sampleSize).toBe(1);
    expect(r.numerator).toBe(1000);
  });

  it('takes the full hit when a customer churns', () => {
    const r = netUsageRetention([
      acc({ accountId: 'a', usage4w: 1000, usagePrev4w: 1000 }),
      acc({ accountId: 'gone', pipelineStage: 'churned', usage4w: 0, usagePrev4w: 1000 }),
    ]);
    expect(r.rate).toBe(0.5);
  });

  it('gives a churned account no credit even if a trickle of usage remains', () => {
    const r = netUsageRetention([
      acc({ accountId: 'gone', pipelineStage: 'churned', usage4w: 300, usagePrev4w: 1000 }),
    ]);
    expect(r.numerator).toBe(0);
    expect(r.denominator).toBe(1000);
    expect(r.rate).toBe(0);
  });

  it('lets expansion carry the number above 100%', () => {
    const r = netUsageRetention([
      acc({ accountId: 'a', usage4w: 1500, usagePrev4w: 1000 }),
    ]);
    expect(r.rate).toBe(1.5);
  });

  it('returns null rather than 0 with no eligible cohort', () => {
    expect(netUsageRetention([acc({ accountId: 'a', usage4w: 100 })]).rate).toBeNull();
    expect(netUsageRetention([]).rate).toBeNull();
  });
});

describe('gross usage retention', () => {
  it('never exceeds 100% — expansion earns no credit', () => {
    const r = grossUsageRetention([
      acc({ accountId: 'a', usage4w: 5000, usagePrev4w: 1000 }),
    ]);
    expect(r.rate).toBe(1);
  });

  /**
   * Caps per account, not on the total. Capping the sum would let one account's
   * growth hide another's collapse — precisely what GRR is for.
   */
  it('does not let one account growing mask another shrinking', () => {
    const rows = [
      acc({ accountId: 'grower', usage4w: 2000, usagePrev4w: 1000 }),
      acc({ accountId: 'shrinker', usage4w: 200, usagePrev4w: 1000 }),
    ];
    expect(netUsageRetention(rows).rate).toBe(1.1);   // looks fine
    expect(grossUsageRetention(rows).rate).toBeCloseTo(0.6); // tells the truth
  });

  it('uses the same cohort and denominator as NRR', () => {
    const rows = [
      acc({ accountId: 'a', usage4w: 1200, usagePrev4w: 1000 }),
      acc({ accountId: 'new', usage4w: 800, usagePrev4w: 0 }),
      acc({ accountId: 'gone', pipelineStage: 'churned', usage4w: 0, usagePrev4w: 500 }),
    ];
    const nrr = netUsageRetention(rows);
    const grr = grossUsageRetention(rows);
    expect(grr.denominator).toBe(nrr.denominator);
    expect(grr.sampleSize).toBe(nrr.sampleSize);
    expect(grr.numerator).toBe(1000);
  });
});

describe('summarizeCustomerPortfolio', () => {
  const rows = [
    acc({
      accountId: 'a', usage4w: 4000, usagePrev4w: 4000, usageDeltaPct: 0,
      weeksSinceLastUsage: 0,
    }),
    acc({
      accountId: 'b', pipelineStage: 'at_risk', usage4w: 400, usagePrev4w: 1000,
      usageDeltaPct: -0.6, weeksSinceLastUsage: 5,
    }),
    acc({
      accountId: 'gone', pipelineStage: 'churned', usage4w: 0, usagePrev4w: 2000,
      usageDeltaPct: -1, weeksSinceLastUsage: 12,
    }),
  ];

  it('counts only live customers, but keeps churn in the retention denominator', () => {
    const s = summarizeCustomerPortfolio(rows);
    expect(s.activeCustomers).toBe(2);
    expect(s.usage4w).toBe(4400);
    // (4400 - 5000) / 5000 over live accounts only
    expect(s.usageDeltaPct).toBeCloseTo(-0.12);
    // 4400 / 7000 — the churned 2000 stays in the denominator, as it must.
    expect(s.nrr.denominator).toBe(7000);
    expect(s.nrr.numerator).toBe(4400);
    expect(s.grr.denominator).toBe(7000);
    expect(s.grr.numerator).toBe(4400);
  });

  it('counts dormant and contracting live accounts, never the churned one', () => {
    const s = summarizeCustomerPortfolio(rows);
    expect(s.dormant).toBe(1);
    expect(s.contracting).toBe(1);
  });

  it('applies the dormancy and contraction thresholds it is given', () => {
    const cfg = { ...DEFAULT_CUSTOMER_THRESHOLDS, dormantWeeks: 6, contractionThresholdPct: 70 };
    const s = summarizeCustomerPortfolio(rows, cfg);
    expect(s.dormant).toBe(0);
    expect(s.contracting).toBe(0);
  });

  it('does not count contraction it cannot trust', () => {
    const shaky = [acc({ accountId: 'x', usageDeltaPct: -0.9, signalQuality: 'stale' })];
    expect(summarizeCustomerPortfolio(shaky).contracting).toBe(0);
  });

  it('counts accounts whose signals cannot be trusted', () => {
    const withStale = [...rows, acc({ accountId: 'c', signalQuality: 'none' })];
    expect(summarizeCustomerPortfolio(withStale).withoutFreshSignals).toBe(1);
  });

  it('survives an empty board without NaN', () => {
    const s = summarizeCustomerPortfolio([]);
    expect(s.activeCustomers).toBe(0);
    expect(s.usage4w).toBe(0);
    expect(s.nrr.rate).toBeNull();
    expect(s.grr.rate).toBeNull();
    expect(s.usageDeltaPct).toBeNull();
  });
});

describe('enteredRiskSince', () => {
  const NOW = new Date('2026-08-03T12:00:00Z').getTime();
  const daysAgo = (n: number) => new Date(NOW - n * DAY_MS).toISOString();

  it('returns only At Risk accounts whose stage changed inside the window', () => {
    const rows = [
      acc({ accountId: 'fresh', pipelineStage: 'at_risk' }),
      acc({ accountId: 'old', pipelineStage: 'at_risk' }),
      acc({ accountId: 'unknown', pipelineStage: 'at_risk' }),
      acc({ accountId: 'steady', pipelineStage: 'steady' }),
    ];
    const changedAt = new Map<string, string | null>([
      ['fresh', daysAgo(2)],
      ['old', daysAgo(30)],
      ['unknown', null],
      ['steady', daysAgo(1)],
    ]);
    expect(enteredRiskSince(rows, changedAt, 7, NOW).map((r) => r.accountId)).toEqual(['fresh']);
  });
});

describe('topUsageDrops', () => {
  it('ranks the worst falls first and ignores accounts with no baseline', () => {
    const rows = [
      acc({ accountId: 'small', usageDeltaPct: -0.1 }),
      acc({ accountId: 'big', usageDeltaPct: -0.8 }),
      acc({ accountId: 'growing', usageDeltaPct: 0.4 }),
      acc({ accountId: 'no-baseline', usageDeltaPct: null }),
    ];
    expect(topUsageDrops(rows).map((r) => r.accountId)).toEqual(['big', 'small']);
  });

  it('respects the limit', () => {
    const rows = [-0.1, -0.2, -0.3].map((d, i) => acc({ accountId: `a${i}`, usageDeltaPct: d }));
    expect(topUsageDrops(rows, 2).map((r) => r.accountId)).toEqual(['a2', 'a1']);
  });
});

describe('formatting', () => {
  it('compacts amounts for a dense header', () => {
    expect(compactAmount(84_000)).toBe('84k');
    expect(compactAmount(1_250_000)).toBe('1.3M');
    expect(compactAmount(420)).toBe('420');
  });

  it('always shows numerator and denominator, per the operating model rule', () => {
    const r = { numerator: 84_000, denominator: 79_000, rate: 84 / 79, sampleSize: 5 };
    expect(formatRatio(r)).toBe('84k / 79k = 106%');
  });

  it('renders an em dash, not 0%, when there is nothing to divide by', () => {
    expect(formatRatio({ numerator: 0, denominator: 0, rate: null, sampleSize: 0 })).toBe('—');
  });
});
