import { describe, it, expect } from 'vitest';
import {
  DAY_MS,
  daysSince,
  computeMrrKpis,
  type PortfolioAccount,
  type HealthLogRow,
} from './portfolioMath';

/** Fixed clock — every time-dependent assertion below is anchored to this. */
const NOW = new Date('2026-07-28T12:00:00Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * DAY_MS).toISOString();

function acc(over: Partial<PortfolioAccount> & { id: string }): PortfolioAccount {
  return {
    name: `Account ${over.id}`,
    arr: 0,
    mrr: 0,
    healthScore: 0,
    ...over,
  };
}

describe('daysSince', () => {
  it('returns Infinity for a missing date rather than 0 or NaN', () => {
    expect(daysSince(null, NOW)).toBe(Infinity);
    expect(daysSince(undefined, NOW)).toBe(Infinity);
  });

  it('floors to whole days', () => {
    expect(daysSince(daysAgo(30), NOW)).toBe(30);
    expect(daysSince(new Date(NOW - 30 * DAY_MS - 3600_000).toISOString(), NOW)).toBe(30);
  });
});

describe('computeMrrKpis', () => {
  const accounts = [
    acc({ id: 'a', arr: 1000, mrr: 100, healthScore: 90 }), // healthy
    acc({ id: 'b', arr: 2000, mrr: 200, healthScore: 55 }), // concerning
    acc({ id: 'c', arr: 4000, mrr: 400, healthScore: 20 }), // poor / at risk
    acc({ id: 'd', arr: 8000, mrr: 800, healthScore: 0 }),  // NO LOGS
  ];
  const withLogs = new Set(['a', 'b', 'c']);

  it('totals span every account, including unscored ones', () => {
    const k = computeMrrKpis(accounts, withLogs, [], NOW);
    expect(k.totalARR).toBe(15000);
    expect(k.totalMRR).toBe(1500);
    expect(k.accountCount).toBe(4);
  });

  // `totalMRR` is a target typed in per account, and most accounts never get
  // one. Captioning it with `accountCount` claims a coverage it does not have:
  // "N accounts" over a figure that came from fewer than half of them.
  it('mrrAccountCount counts only accounts that actually carry a target', () => {
    const mixed = [
      acc({ id: 'a', mrr: 100, healthScore: 90 }),
      acc({ id: 'b', mrr: 0, healthScore: 55 }),
      acc({ id: 'c', healthScore: 20 }), // no mrr at all
    ];
    const k = computeMrrKpis(mixed, new Set(['a', 'b', 'c']), [], NOW);
    expect(k.accountCount).toBe(3);
    expect(k.mrrAccountCount).toBe(1);
    expect(k.totalMRR).toBe(100);
  });

  // The gate that stops an unmeasured portfolio from looking like a failing one.
  it('excludes accounts without logs from healthy AND risk numerators', () => {
    const k = computeMrrKpis(accounts, withLogs, [], NOW);
    expect(k.scoredCount).toBe(3);
    expect(k.healthyCount).toBe(1);
    expect(k.healthyARR).toBe(1000);
    // 'd' has healthScore 0 but no log — it must NOT count as at-risk
    expect(k.riskCount).toBe(1);
    expect(k.riskARR).toBe(4000);
    expect(k.riskMRR).toBe(400);
  });

  // Threshold standardisation: 55 is 'concerning', not 'at risk'.
  it('uses <40 for at-risk, so a mid-band score is neither healthy nor at risk', () => {
    const k = computeMrrKpis(accounts, withLogs, [], NOW);
    expect(k.healthyCount + k.riskCount).toBe(2); // 'b' at 55 is in neither
  });

  it('healthyPct is over scored accounts, not all accounts', () => {
    const k = computeMrrKpis(accounts, withLogs, [], NOW);
    expect(k.healthyPct).toBe(33); // 1 of 3 scored, not 1 of 4
  });

  it('avgHealthDelta is 0 — never NaN — when there is no baseline', () => {
    const k = computeMrrKpis(accounts, withLogs, [], NOW);
    expect(k.avgHealthDelta).toBe(0);
    expect(Number.isNaN(k.avgHealthDelta)).toBe(false);
  });

  it('is safe on an empty portfolio', () => {
    const k = computeMrrKpis([], new Set(), [], NOW);
    expect(k.avgHealth).toBe(0);
    expect(k.healthyPct).toBe(0);
    expect(k.avgHealthDelta).toBe(0);
  });

  /**
   * The off-by-one bait: with logs sorted DESC, the baseline for an account must
   * be its MOST RECENT log at-or-before the cutoff — not its oldest. Three logs
   * on one account make the two answers differ (60 vs 30).
   */
  it('takes the most recent pre-cutoff log as the baseline, not the oldest', () => {
    const logs: HealthLogRow[] = [
      { account_id: 'a', total_score: 90, logged_at: daysAgo(1).slice(0, 10) },  // current
      { account_id: 'a', total_score: 60, logged_at: daysAgo(10).slice(0, 10) }, // baseline
      { account_id: 'a', total_score: 30, logged_at: daysAgo(40).slice(0, 10) }, // older still
    ];
    const k = computeMrrKpis([acc({ id: 'a', healthScore: 90 })], new Set(['a']), logs, NOW);
    expect(k.avgHealth).toBe(90);
    expect(k.avgHealthDelta).toBe(30); // 90 − 60, NOT 90 − 30
  });

  it('ignores logs newer than the cutoff when building the baseline', () => {
    const logs: HealthLogRow[] = [
      { account_id: 'a', total_score: 90, logged_at: daysAgo(1).slice(0, 10) },
    ];
    const k = computeMrrKpis([acc({ id: 'a', healthScore: 90 })], new Set(['a']), logs, NOW);
    expect(k.avgHealthDelta).toBe(0); // nothing old enough to compare against
  });
});
