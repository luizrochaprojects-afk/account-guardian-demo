import { describe, it, expect } from 'vitest';
import { ALL_STAGES, PIPELINE_PHASES, STAGE_TO_PHASE, phaseForStage } from './pipelinePhases';
import { PIPELINE_STAGES } from './transitionStage';
import { STAGE_LABELS } from './pipelineStages';

describe('phaseForStage', () => {
  it('maps a stage from each phase', () => {
    expect(phaseForStage('target')).toBe('sdr');
    expect(phaseForStage('discovery_call')).toBe('sales');
    expect(phaseForStage('closed_won')).toBe('onboarding');
    expect(phaseForStage('steady')).toBe('customer');
  });

  it('passes null through, so a failed coercePipelineStage stays null', () => {
    expect(phaseForStage(null)).toBeNull();
  });
});

describe('STAGE_TO_PHASE', () => {
  it('covers every value of the pipeline_stage enum', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(STAGE_TO_PHASE[stage]).toBeDefined();
    }
  });

  it('has no stage the enum does not know about', () => {
    expect([...ALL_STAGES.map((s) => s.key)].sort()).toEqual([...PIPELINE_STAGES].sort());
  });
});

describe('PIPELINE_PHASES', () => {
  it('labels every board column exactly as STAGE_LABELS does', () => {
    for (const phase of PIPELINE_PHASES) {
      for (const st of phase.stages) expect(st.label, st.key).toBe(STAGE_LABELS[st.key]);
    }
  });

  it('lists the four phases in pipeline order', () => {
    expect(PIPELINE_PHASES.map((p) => p.phase))
      .toEqual(['sdr', 'sales', 'onboarding', 'customer']);
  });

  it('ends onboarding at adoption and starts customer at ramping', () => {
    const onboarding = PIPELINE_PHASES.find((p) => p.phase === 'onboarding')!;
    const customer = PIPELINE_PHASES.find((p) => p.phase === 'customer')!;
    expect(onboarding.stages[onboarding.stages.length - 1].key).toBe('adoption');
    expect(customer.stages.map((s) => s.key))
      .toEqual(['ramping', 'steady', 'expanding', 'at_risk', 'churned']);
  });

  it('files every customer stage under the customer phase', () => {
    for (const key of ['ramping', 'steady', 'expanding', 'at_risk', 'churned'] as const) {
      expect(phaseForStage(key)).toBe('customer');
    }
  });

  it('marks exactly the reason-gated stages as terminal', () => {
    const terminal = ALL_STAGES.filter((s) => s.terminal).map((s) => s.key);
    expect(terminal.sort()).toEqual(['churned', 'closed_lost', 'disqualified']);
  });
});
