import { describe, it, expect } from 'vitest';
import {
  classifyCustomerStage,
  customerRiskReason,
  customerBadges,
  explainClassification,
  DEFAULT_CUSTOMER_THRESHOLDS,
  PIN_TTL_DAYS,
  REACTIVATED_BADGE_DAYS,
  DAY_MS,
  type CustomerSignals,
  type CustomerRiskReason,
} from './customerSignals';
import { CUSTOMER_RISK_SEVERITY, customerRiskRank } from './pipelineStages';

/** Fixed clock — no Date.now() anywhere in the module or the tests. */
const NOW = new Date('2026-08-03T12:00:00Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * DAY_MS).toISOString();

/**
 * A healthy, established, boring customer. Every test starts here and breaks
 * exactly one thing, so a failure names the rule that broke.
 */
function base(over: Partial<CustomerSignals> = {}): CustomerSignals {
  return {
    accountId: 'acc-1',
    pipelineStage: 'steady',
    customerSince: daysAgo(400),
    firstUsageAt: daysAgo(380),
    lastUsageAt: daysAgo(1),
    reactivatedAt: null,
    customerStagePinnedAt: null,
    usage4w: 4000,
    usagePrev4w: 4000,
    usageDeltaPct: 0,
    weeksSinceLastUsage: 0,
    daysSinceLastActivity: 3,
    healthScore: 80,
    healthLoggedAt: daysAgo(5),
    cohort: 'M1+',
    signalQuality: 'full',
    ...over,
  };
}

const classify = (s: CustomerSignals, churnedAt: string | null = null) =>
  classifyCustomerStage(s, DEFAULT_CUSTOMER_THRESHOLDS, NOW, churnedAt);
const risk = (s: CustomerSignals) =>
  customerRiskReason(s, DEFAULT_CUSTOMER_THRESHOLDS, NOW);
const badges = (s: CustomerSignals) =>
  customerBadges(s, DEFAULT_CUSTOMER_THRESHOLDS, NOW);

describe('the ladder — every account lands in exactly one column', () => {
  it('a boring established customer is Steady', () => {
    expect(classify(base())).toMatchObject({ stage: 'steady', rule: 'default', riskReason: null });
  });

  it('risk beats expansion — a growing account nobody has talked to is At Risk', () => {
    const s = base({
      usageDeltaPct: 0.9,          // would otherwise be Expanding
      daysSinceLastActivity: 40,
    });
    expect(classify(s)).toMatchObject({
      stage: 'at_risk',
      rule: 'gone_dark',
      riskReason: 'gone_dark',
    });
  });

  it('risk beats the ramp window — a new account can be At Risk', () => {
    const s = base({ cohort: 'M0', firstUsageAt: daysAgo(10), daysSinceLastActivity: 40 });
    expect(classify(s)).toMatchObject({ stage: 'at_risk', riskReason: 'gone_dark' });
  });

  /**
   * The design decision this test defends: expansion is meaningless without a
   * baseline. A three-week-old account growing fast is behaving as expected,
   * not expanding — counting it would inflate retention with new-logo ramp-up.
   */
  it('ramping outranks expanding for an account with no baseline', () => {
    const s = base({
      cohort: 'M0',
      firstUsageAt: daysAgo(10),
      usageDeltaPct: 3,
    });
    expect(classify(s)).toMatchObject({ stage: 'ramping', rule: 'ramp_window' });
  });

  it('first usage inside rampDays is Ramping even outside M0', () => {
    const s = base({ firstUsageAt: daysAgo(DEFAULT_CUSTOMER_THRESHOLDS.rampDays - 1) });
    expect(classify(s)).toMatchObject({ stage: 'ramping', rule: 'ramp_window' });
    const later = base({ firstUsageAt: daysAgo(DEFAULT_CUSTOMER_THRESHOLDS.rampDays + 1) });
    expect(classify(later)).toMatchObject({ stage: 'steady' });
  });

  it('a win-back gets the ramp grace again after reactivation', () => {
    expect(classify(base({ reactivatedAt: daysAgo(10) })))
      .toMatchObject({ stage: 'ramping', rule: 'ramp_window' });
    expect(classify(base({ reactivatedAt: daysAgo(DEFAULT_CUSTOMER_THRESHOLDS.rampDays + 5) })))
      .toMatchObject({ stage: 'steady' });
  });

  it('expansion by usage delta', () => {
    expect(classify(base({ usageDeltaPct: 0.3 })))
      .toMatchObject({ stage: 'expanding', rule: 'expansion', riskReason: null });
  });

  it('a delta exactly on the threshold expands; just under it is still Steady', () => {
    expect(classify(base({ usageDeltaPct: 0.25 })))
      .toMatchObject({ stage: 'expanding' });
    expect(classify(base({ usageDeltaPct: 0.2499 })))
      .toMatchObject({ stage: 'steady' });
  });

  it('honours an org-configured expansion threshold', () => {
    const cfg = { ...DEFAULT_CUSTOMER_THRESHOLDS, expansionThresholdPct: 50 };
    expect(classifyCustomerStage(base({ usageDeltaPct: 0.3 }), cfg, NOW))
      .toMatchObject({ stage: 'steady' });
    expect(classifyCustomerStage(base({ usageDeltaPct: 0.5 }), cfg, NOW))
      .toMatchObject({ stage: 'expanding' });
  });
});

describe('risk rules', () => {
  const cases: Array<[string, Partial<CustomerSignals>, CustomerRiskReason]> = [
    ['H1 stopped using the product',
      { weeksSinceLastUsage: 3 }, 'no_usage'],
    ['H2 health below 40, logged recently',
      { healthScore: 25, healthLoggedAt: daysAgo(3) }, 'poor_health'],
    ['H3 gone dark',
      { daysSinceLastActivity: 40 }, 'gone_dark'],
    ['S1 usage collapsing',
      { usageDeltaPct: -0.4 }, 'contracting'],
  ];

  for (const [name, over, expected] of cases) {
    it(name, () => {
      expect(risk(base(over))).toBe(expected);
    });
  }

  it('a healthy account has no risk reason', () => {
    expect(risk(base())).toBeNull();
  });

  it('no_usage fires at two weeks, not before', () => {
    expect(risk(base({ weeksSinceLastUsage: 1.9 }))).toBeNull();
    expect(risk(base({ weeksSinceLastUsage: 2 }))).toBe('no_usage');
  });

  it('an account that never used the product has not "stopped" using it', () => {
    expect(risk(base({ firstUsageAt: null, weeksSinceLastUsage: 10 }))).toBeNull();
  });

  it('health exactly at the threshold is not poor', () => {
    expect(risk(base({ healthScore: 40 }))).toBeNull();
    expect(risk(base({ healthScore: 39 }))).toBe('poor_health');
  });

  it('a stale health log is not evidence', () => {
    expect(risk(base({ healthScore: 10, healthLoggedAt: daysAgo(200) }))).toBeNull();
  });

  it('a health score with no log date is not evidence', () => {
    expect(risk(base({ healthScore: 10, healthLoggedAt: null }))).toBeNull();
  });

  it('gone_dark fires strictly past goneDarkDays', () => {
    const d = DEFAULT_CUSTOMER_THRESHOLDS.goneDarkDays;
    expect(risk(base({ daysSinceLastActivity: d }))).toBeNull();
    expect(risk(base({ daysSinceLastActivity: d + 1 }))).toBe('gone_dark');
  });

  it('contracting fires at the contraction threshold, not just short of it', () => {
    expect(risk(base({ usageDeltaPct: -0.25 }))).toBe('contracting');
    expect(risk(base({ usageDeltaPct: -0.2499 }))).toBeNull();
  });

  it('honours an org-configured contraction threshold', () => {
    const cfg = { ...DEFAULT_CUSTOMER_THRESHOLDS, contractionThresholdPct: 50 };
    expect(customerRiskReason(base({ usageDeltaPct: -0.4 }), cfg, NOW)).toBeNull();
    expect(customerRiskReason(base({ usageDeltaPct: -0.5 }), cfg, NOW)).toBe('contracting');
  });

  it('returns the WORST matching rule, not the first one written', () => {
    // Every rule fires at once; H1 must win.
    const all = {
      weeksSinceLastUsage: 5,
      healthScore: 10, healthLoggedAt: daysAgo(1), daysSinceLastActivity: 90,
      usageDeltaPct: -0.9,
    };
    expect(risk(base(all))).toBe('no_usage');
    // Peel the worst one off each time: the next-worst must surface.
    expect(risk(base({ ...all, weeksSinceLastUsage: 0 }))).toBe('poor_health');
    expect(risk(base({ ...all, weeksSinceLastUsage: 0, healthScore: 80 }))).toBe('gone_dark');
    expect(risk(base({
      ...all, weeksSinceLastUsage: 0, healthScore: 80, daysSinceLastActivity: 3,
    }))).toBe('contracting');
  });

  it('the reason vocabulary matches the severity ladder in pipelineStages', () => {
    const produced = cases.map(([, , expected]) => expected);
    expect([...CUSTOMER_RISK_SEVERITY]).toEqual(produced);
    // and the ladder is ordered the same way the rules fire
    const ranks = produced.map(customerRiskRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe('M0 only gets the hard rules', () => {
  const m0 = (over: Partial<CustomerSignals> = {}) =>
    base({ cohort: 'M0', firstUsageAt: daysAgo(10), ...over });

  it('does not fire contracting on a new account with lumpy usage', () => {
    const s = m0({ usageDeltaPct: -0.8 });
    expect(risk(s)).toBeNull();
    expect(classify(s)).toMatchObject({ stage: 'ramping' });
  });

  it('still fires the hard rules — a new account can absolutely be at risk', () => {
    expect(classify(m0({ weeksSinceLastUsage: 3 })))
      .toMatchObject({ stage: 'at_risk', riskReason: 'no_usage' });
    expect(classify(m0({ healthScore: 20 })))
      .toMatchObject({ stage: 'at_risk', riskReason: 'poor_health' });
    expect(classify(m0({ daysSinceLastActivity: 40 })))
      .toMatchObject({ stage: 'at_risk', riskReason: 'gone_dark' });
  });
});

describe('degraded signals', () => {
  for (const quality of ['partial', 'stale', 'none'] as const) {
    it(`never classifies on usage when signal quality is ${quality}`, () => {
      const s = base({ signalQuality: quality, weeksSinceLastUsage: 6, usageDeltaPct: -0.9 });
      expect(risk(s)).toBeNull();
      expect(classify(s)).toMatchObject({ stage: 'steady' });
    });
  }

  it('still classifies on health and activity without usage', () => {
    expect(classify(base({ signalQuality: 'none', daysSinceLastActivity: 45 })))
      .toMatchObject({ stage: 'at_risk', riskReason: 'gone_dark' });
    expect(classify(base({ signalQuality: 'stale', healthScore: 20 })))
      .toMatchObject({ stage: 'at_risk', riskReason: 'poor_health' });
  });

  it('never reports expansion it cannot see', () => {
    expect(classify(base({ signalQuality: 'none', usageDeltaPct: 5 })))
      .toMatchObject({ stage: 'steady' });
    expect(classify(base({ signalQuality: 'partial', usageDeltaPct: 5 })))
      .toMatchObject({ stage: 'steady' });
  });

  it('treats a null delta as "not computable", never as a fall', () => {
    expect(classify(base({ usageDeltaPct: null, usagePrev4w: 0 })))
      .toMatchObject({ stage: 'steady' });
  });

  /**
   * The day-1 case, and the one that would have been silently wrong: with no
   * usage data at all, cohort is null. Without the customer_since fallback
   * every existing customer would pile into Ramping.
   */
  it('falls back to customer_since when there is no usage history', () => {
    const old = base({
      cohort: null, firstUsageAt: null, lastUsageAt: null, signalQuality: 'none',
    });
    expect(classify(old)).toMatchObject({ stage: 'steady' });

    const fresh = base({
      cohort: null, firstUsageAt: null, lastUsageAt: null, signalQuality: 'none',
      customerSince: daysAgo(5),
    });
    expect(classify(fresh)).toMatchObject({ stage: 'ramping', rule: 'ramp_window' });
  });
});

describe('pin — a human decision stands, then expires', () => {
  it('leaves a freshly pinned account alone', () => {
    expect(classify(base({ customerStagePinnedAt: daysAgo(1), daysSinceLastActivity: 90 })))
      .toBeNull();
  });

  it('the pin outranks even churn and onboarding', () => {
    const pinned = daysAgo(1);
    expect(classify(base({ pipelineStage: 'adoption', customerStagePinnedAt: pinned })))
      .toBeNull();
    expect(classify(
      base({ pipelineStage: 'churned', customerStagePinnedAt: pinned, lastUsageAt: daysAgo(1) }),
      daysAgo(30),
    )).toBeNull();
  });

  it('resumes classifying once the pin expires', () => {
    const s = base({ customerStagePinnedAt: daysAgo(PIN_TTL_DAYS + 1), daysSinceLastActivity: 90 });
    expect(classify(s)).toMatchObject({ stage: 'at_risk', riskReason: 'gone_dark' });
  });

  it('expires exactly at the TTL', () => {
    expect(classify(base({ customerStagePinnedAt: daysAgo(PIN_TTL_DAYS) })))
      .toMatchObject({ stage: 'steady' });
  });
});

describe('churn is absorbing except for usage coming back', () => {
  const churned = (over: Partial<CustomerSignals> = {}) =>
    base({ pipelineStage: 'churned', ...over });

  it('never moves an account INTO churned — that needs a human', () => {
    const dead = base({ weeksSinceLastUsage: 20, lastUsageAt: daysAgo(140), healthScore: 5 });
    expect(classify(dead)!.stage).toBe('at_risk');
    expect(classify(dead)!.stage).not.toBe('churned');
  });

  it('leaves a churned account churned when the last usage predates the churn', () => {
    expect(classify(churned({ lastUsageAt: daysAgo(400) }), daysAgo(30))).toBeNull();
  });

  it('leaves a churned account churned when there is no usage at all', () => {
    expect(classify(churned({ lastUsageAt: null }), daysAgo(30))).toBeNull();
  });

  it('leaves it alone when the churn date is unknown', () => {
    expect(classify(churned({ lastUsageAt: daysAgo(2) }), null)).toBeNull();
  });

  it('brings it back to Ramping when usage lands after the churn', () => {
    expect(classify(churned({ lastUsageAt: daysAgo(2) }), daysAgo(30)))
      .toMatchObject({ stage: 'ramping', rule: 'reactivation', riskReason: null });
  });
});

describe('onboarding handoff', () => {
  it('waits for real usage before taking the account over', () => {
    expect(classify(base({ pipelineStage: 'adoption', firstUsageAt: null }))).toBeNull();
  });

  it('hands over on first usage', () => {
    expect(classify(base({ pipelineStage: 'adoption', firstUsageAt: daysAgo(1) })))
      .toMatchObject({ stage: 'ramping', rule: 'onboarding_handoff' });
  });
});

describe('badges carry what the five columns cannot', () => {
  it('flags contraction whichever column the account lands in', () => {
    // -30% trips the S1 risk rule for M1+ — the badge must be present either
    // way, because the column alone does not say which risk.
    expect(badges(base({ usageDeltaPct: -0.3 }))).toContain('Contracting');
    // and on an M0 account, where the risk rule is exempt, the badge still shows
    expect(badges(base({ cohort: 'M0', usageDeltaPct: -0.3 }))).toContain('Contracting');
  });

  it('does not flag contraction on untrusted usage', () => {
    expect(badges(base({ signalQuality: 'partial', usageDeltaPct: -0.9 })))
      .not.toContain('Contracting');
  });

  it('flags dormancy from dormantWeeks on', () => {
    const w = DEFAULT_CUSTOMER_THRESHOLDS.dormantWeeks;
    expect(badges(base({ weeksSinceLastUsage: w }))).toContain('Dormant');
    expect(badges(base({ weeksSinceLastUsage: w - 1 }))).not.toContain('Dormant');
  });

  it('says out loud when there is no usage data', () => {
    expect(badges(base({ signalQuality: 'none' }))).toContain('No usage data');
  });

  it('distinguishes a late re-sync from an account with thin history', () => {
    // 'stale' is the pipeline being behind — actionable by whoever runs the
    // re-sync. Collapsing it into 'No usage data' sends the operator looking
    // at the customer instead of at the ETL.
    const stale = badges(base({ signalQuality: 'stale' }));
    expect(stale).toContain('Usage data stale');
    expect(stale).not.toContain('No usage data');
    expect(stale).not.toContain('Thin usage history');

    const partial = badges(base({ signalQuality: 'partial' }));
    expect(partial).toContain('Thin usage history');
    expect(partial).not.toContain('Usage data stale');
    expect(partial).not.toContain('No usage data');
  });

  it(`marks a win-back for ${REACTIVATED_BADGE_DAYS} days`, () => {
    expect(badges(base({ reactivatedAt: daysAgo(30) }))).toContain('Reactivated');
    expect(badges(base({ reactivatedAt: daysAgo(REACTIVATED_BADGE_DAYS) }))).toContain('Reactivated');
    expect(badges(base({ reactivatedAt: daysAgo(120) }))).not.toContain('Reactivated');
  });

  it('marks the first month', () => {
    expect(badges(base({ cohort: 'M0' }))).toContain('M0');
  });

  it('shows the pin only while it stands', () => {
    expect(badges(base({ customerStagePinnedAt: daysAgo(1) }))).toContain('Pinned');
    expect(badges(base({ customerStagePinnedAt: daysAgo(PIN_TTL_DAYS + 1) })))
      .not.toContain('Pinned');
  });

  it('a boring account carries no badges — quiet by default', () => {
    expect(badges(base())).toEqual([]);
  });
});

describe('explainClassification', () => {
  it('gives a reason a human can act on, for every rule', () => {
    const s = base({ weeksSinceLastUsage: 3, daysSinceLastActivity: 40, healthScore: 25 });
    for (const rule of [
      'no_usage', 'poor_health', 'gone_dark', 'contracting', 'expansion',
      'ramp_window', 'onboarding_handoff', 'reactivation', 'pinned', 'default',
    ] as const) {
      const text = explainClassification({ stage: 'at_risk', rule, riskReason: null }, s);
      expect(text.length, `rule ${rule} has no explanation`).toBeGreaterThan(10);
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('null');
    }
  });

  it('quotes the actual numbers, not a generic string', () => {
    const explain = (rule: CustomerRiskReason | 'expansion', over: Partial<CustomerSignals>) =>
      explainClassification({ stage: 'at_risk', rule, riskReason: null }, base(over));

    expect(explain('no_usage', { weeksSinceLastUsage: 3 })).toBe('At Risk — no usage for 3 weeks');
    expect(explain('poor_health', { healthScore: 25 })).toBe('At Risk — health score 25, below 40');
    expect(explain('gone_dark', { daysSinceLastActivity: 40 })).toBe('At Risk — no activity for 40 days');
    expect(explain('contracting', { usageDeltaPct: -0.4 }))
      .toBe('At Risk — usage -40% vs. previous 4 weeks');
    expect(explain('expansion', { usageDeltaPct: 0.3 }))
      .toBe('Expanding — usage +30% vs. previous 4 weeks');
  });

  it('falls back to words when the delta is not computable', () => {
    const s = base({ usageDeltaPct: null });
    expect(explainClassification({ stage: 'at_risk', rule: 'contracting', riskReason: 'contracting' }, s))
      .toBe('At Risk — usage falling');
    expect(explainClassification({ stage: 'expanding', rule: 'expansion', riskReason: null }, s))
      .toBe('Expanding — usage up');
  });
});
