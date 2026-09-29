import { describe, it, expect } from 'vitest';
import {
  isReasonGated,
  STAGE_REASON_CONFIG,
  DISQUALIFY_REASONS,
  CHURN_REASONS,
  LOSS_REASONS,
  shouldPromptForIncumbent,
} from './stageReasons';
import type { PipelineStage } from './transitionStage';

describe('shouldPromptForIncumbent', () => {
  it('prompts on the disqualify reasons an incumbent causes', () => {
    expect(shouldPromptForIncumbent('disqualified', 'competitor_locked')).toBe(true);
    expect(shouldPromptForIncumbent('disqualified', 'bad_timing')).toBe(true);
  });

  it('prompts on the loss reasons an incumbent causes', () => {
    expect(shouldPromptForIncumbent('closed_lost', 'competitor_blocks')).toBe(true);
    expect(shouldPromptForIncumbent('closed_lost', 'current_stack_sufficient')).toBe(true);
    expect(shouldPromptForIncumbent('closed_lost', 'bad_timing')).toBe(true);
  });

  it('stays out of the way for reasons that have nothing to do with an incumbent', () => {
    expect(shouldPromptForIncumbent('disqualified', 'no_response')).toBe(false);
    expect(shouldPromptForIncumbent('closed_lost', 'no_volume')).toBe(false);
    expect(shouldPromptForIncumbent('closed_lost', 'compliance_risk')).toBe(false);
  });

  it('never prompts on churn, where the incumbent is us', () => {
    expect(shouldPromptForIncumbent('churned', 'switched_competitor')).toBe(false);
  });

  it('is false before a reason has been chosen', () => {
    expect(shouldPromptForIncumbent('closed_lost', '')).toBe(false);
  });
});

describe('isReasonGated', () => {
  it('is true only for the three reason-gated terminal stages', () => {
    expect(isReasonGated('disqualified')).toBe(true);
    expect(isReasonGated('closed_lost')).toBe(true);
    expect(isReasonGated('churned')).toBe(true);
  });

  it('is false for every other stage', () => {
    const others: PipelineStage[] = [
      'target', 'working', 'paused', 'discovery_call', 'qualified_opportunity',
      'business_case', 'sign_off', 'closed_won', 'setup', 'pilot_running',
      'pilot_review', 'adoption', 'ramping', 'steady', 'expanding', 'at_risk',
    ];
    for (const s of others) expect(isReasonGated(s)).toBe(false);
  });
});

describe('STAGE_REASON_CONFIG', () => {
  it('maps each gated stage to the correct metadata key and options', () => {
    expect(STAGE_REASON_CONFIG.disqualified.metadataKey).toBe('disqualify_reason');
    expect(STAGE_REASON_CONFIG.disqualified.options).toBe(DISQUALIFY_REASONS);

    expect(STAGE_REASON_CONFIG.closed_lost.metadataKey).toBe('loss_reason_category');
    expect(STAGE_REASON_CONFIG.closed_lost.options).toBe(LOSS_REASONS);

    expect(STAGE_REASON_CONFIG.churned.metadataKey).toBe('churn_reason');
    expect(STAGE_REASON_CONFIG.churned.options).toBe(CHURN_REASONS);
  });

  it('has non-empty option lists with the expected sizes', () => {
    expect(DISQUALIFY_REASONS).toHaveLength(8);
    expect(CHURN_REASONS).toHaveLength(8);
    expect(LOSS_REASONS).toHaveLength(12);
  });

  it('frames a no-fit loss as our decision, with no leftover pricing-model reason', () => {
    const values = LOSS_REASONS.map((r) => r.value as string);
    expect(values).toContain('we_declined_no_fit');
    expect(values).not.toContain('rb_vetoed_no_fit');
    expect(values).not.toContain('distrusts_pay_for_performance');
    expect(LOSS_REASONS.find((r) => r.value === 'we_declined_no_fit')!.label)
      .toBe('We declined — no fit');
  });
});
