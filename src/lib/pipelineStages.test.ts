import { describe, it, expect } from 'vitest';
import {
  ALL_STAGES_ORDERED,
  FORWARD_STAGES,
  LATERAL_STAGES,
  EXIT_STAGES,
  SALES_SPINE,
  STAGE_LABELS,
  STAGE_SHORT_LABELS,
  stageLabel,
  lossReasonLabel,
  exitReasonLabel,
  stageRank,
  phaseForStage,
  formatRate,
  CUSTOMER_RISK_SEVERITY,
  customerRiskReasonLabel,
  customerRiskRank,
  type PipelineStage,
} from './pipelineStages';

/**
 * The full enum, written out independently of the source file. If someone adds a
 * stage in a migration and regenerates types.ts without updating pipelineStages,
 * the exhaustiveness test below fails here rather than silently rendering a raw
 * enum key in the UI.
 */
const ENUM_MEMBERS: PipelineStage[] = [
  'target', 'working', 'paused', 'disqualified',
  'discovery_call', 'qualified_opportunity', 'business_case', 'sign_off', 'closed_lost',
  'closed_won', 'setup', 'pilot_running', 'pilot_review', 'adoption',
  'ramping', 'steady', 'expanding', 'at_risk', 'churned',
];

describe('enum coverage', () => {
  it('ALL_STAGES_ORDERED contains every member exactly once', () => {
    expect([...ALL_STAGES_ORDERED].sort()).toEqual([...ENUM_MEMBERS].sort());
    expect(new Set(ALL_STAGES_ORDERED).size).toBe(ALL_STAGES_ORDERED.length);
  });

  it('forward, lateral and exit stages partition the enum', () => {
    expect(FORWARD_STAGES.length + LATERAL_STAGES.length + EXIT_STAGES.length)
      .toBe(ENUM_MEMBERS.length);
    const all = [...FORWARD_STAGES, ...LATERAL_STAGES, ...EXIT_STAGES];
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps the three categories disjoint', () => {
    for (const s of LATERAL_STAGES) {
      expect(FORWARD_STAGES).not.toContain(s);
      expect(EXIT_STAGES).not.toContain(s);
    }
  });

  it('exit stages are exactly the four the SQL leaves unranked', () => {
    expect([...EXIT_STAGES].sort()).toEqual(
      ['churned', 'closed_lost', 'disqualified', 'paused'],
    );
  });

  it('both label maps cover every member', () => {
    for (const s of ENUM_MEMBERS) {
      expect(STAGE_LABELS[s], `STAGE_LABELS missing ${s}`).toBeTruthy();
      expect(STAGE_SHORT_LABELS[s], `STAGE_SHORT_LABELS missing ${s}`).toBeTruthy();
    }
  });

  it('SALES_SPINE is a subsequence of the forward path', () => {
    const positions = SALES_SPINE.map((s) => FORWARD_STAGES.indexOf(s));
    expect(positions).not.toContain(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('stageRank — mirrors public.pipeline_stage_rank()', () => {
  it('ranks the forward path 1..13 in order', () => {
    expect(FORWARD_STAGES.map(stageRank))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it('returns null for every exit stage', () => {
    for (const s of EXIT_STAGES) {
      expect(stageRank(s), `${s} should be unranked`).toBeNull();
    }
  });

  /**
   * The whole reason LATERAL_STAGES exists. dashboard_stage_conversion joins
   * rank = from_rank + 1 to build cohorts; ranking a state an account re-enters
   * would manufacture conversions every time a customer cycles
   * steady -> expanding -> steady.
   */
  it('leaves the recurring customer states unranked', () => {
    for (const s of LATERAL_STAGES) {
      expect(stageRank(s), `${s} is not a funnel step`).toBeNull();
    }
  });

  it('ranks are unique and gapless, or the conversion join skips a step', () => {
    const ranks = FORWARD_STAGES.map(stageRank);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(ranks).toEqual(ranks.map((_, i) => i + 1));
  });
});

describe('phaseForStage — mirrors transition_stage() and phase_for_stage()', () => {
  it('maps the SDR stages', () => {
    for (const s of ['target', 'working', 'paused', 'disqualified'] as PipelineStage[]) {
      expect(phaseForStage(s)).toBe('sdr');
    }
  });

  it('maps the sales stages, including closed_lost', () => {
    for (const s of [
      'discovery_call', 'qualified_opportunity', 'business_case', 'sign_off', 'closed_lost',
    ] as PipelineStage[]) {
      expect(phaseForStage(s)).toBe('sales');
    }
  });

  it('maps the onboarding stages, which now END at adoption', () => {
    for (const s of [
      'closed_won', 'setup', 'pilot_running', 'pilot_review', 'adoption',
    ] as PipelineStage[]) {
      expect(phaseForStage(s)).toBe('onboarding');
    }
  });

  it('maps the customer stages — churn included', () => {
    for (const s of [
      'ramping', 'steady', 'expanding', 'at_risk', 'churned',
    ] as PipelineStage[]) {
      expect(phaseForStage(s)).toBe('customer');
    }
  });
});

describe('customer risk reasons', () => {
  it('labels every reason the classifier can write', () => {
    for (const key of CUSTOMER_RISK_SEVERITY) {
      expect(customerRiskReasonLabel(key)).not.toBe(key);
    }
  });

  it('describes each reason in usage terms', () => {
    expect(customerRiskReasonLabel('no_usage')).toBe('No usage for 2+ weeks');
    expect(customerRiskReasonLabel('contracting')).toBe('Usage falling');
  });

  it('falls through to the raw key rather than rendering nothing', () => {
    expect(customerRiskReasonLabel('some_new_rule')).toBe('some_new_rule');
    expect(customerRiskReasonLabel(null)).toBe('—');
  });

  it('ranks severity worst-first and sorts unknowns last', () => {
    expect(customerRiskRank('no_usage')).toBe(0);
    expect(customerRiskRank('poor_health')).toBe(1);
    expect(customerRiskRank('gone_dark')).toBe(2);
    expect(customerRiskRank('contracting')).toBe(3);
    expect(customerRiskRank('contracting'))
      .toBeGreaterThan(customerRiskRank('no_usage'));
    expect(customerRiskRank('mystery')).toBe(Number.MAX_SAFE_INTEGER);
    expect(customerRiskRank(null)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('labels', () => {
  it('short labels differ from full ones only where a table needs the room', () => {
    expect(stageLabel('discovery_call')).toBe('Meeting booked');
    expect(stageLabel('discovery_call', true)).toBe('Meeting booked');
    expect(stageLabel('sign_off')).toBe('Sign-off');
    expect(stageLabel('sign_off', true)).toBe('Sign-off');
  });

  it('falls through to the raw key for unknown stages', () => {
    expect(stageLabel('some_future_stage')).toBe('some_future_stage');
  });

  it('names the post-close stages in usage terms, keeping the enum keys', () => {
    expect(stageLabel('closed_won')).toBe('Won');
    expect(stageLabel('setup')).toBe('Go-Live Pending');
    expect(stageLabel('pilot_running')).toBe('First Usage');
    expect(stageLabel('pilot_review')).toBe('Ramp Review');
    expect(stageLabel('adoption')).toBe('Ramped');
  });

  it('renders an em dash for null/undefined rather than "undefined"', () => {
    expect(stageLabel(null)).toBe('—');
    expect(stageLabel(undefined)).toBe('—');
    expect(lossReasonLabel(null)).toBe('—');
  });

  it('exitReasonLabel resolves across all three reason enums', () => {
    expect(exitReasonLabel('no_budget')).toBe('No budget');           // loss
    expect(exitReasonLabel('competitor_locked')).toBe('Competitor locked'); // disqualify
    expect(exitReasonLabel('lost_champion')).toBe('Lost champion');   // churn
    expect(exitReasonLabel('unknown_key')).toBe('unknown_key');
  });
});

describe('formatRate', () => {
  it('renders an em dash for null so "no data" never reads as 0%', () => {
    expect(formatRate(null)).toBe('—');
    expect(formatRate(undefined)).toBe('—');
    expect(formatRate(NaN)).toBe('—');
    expect(formatRate(Infinity)).toBe('—');
  });

  it('rounds to whole percent', () => {
    expect(formatRate(0)).toBe('0%');
    expect(formatRate(0.4213)).toBe('42%');
    expect(formatRate(0.5)).toBe('50%');
    expect(formatRate(1)).toBe('100%');
  });
});
