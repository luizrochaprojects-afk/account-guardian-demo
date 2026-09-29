import { describe, it, expect } from 'vitest';
import { buildFunnelSteps, FIRST_USAGE_STEP, FIRST_USAGE_LABEL } from './salesFunnel';
import type { SalesFunnelRow } from '@/hooks/useSalesFunnel';

function row(overrides: Partial<SalesFunnelRow> & { step: string }): SalesFunnelRow {
  return {
    stepOrder: 1,
    entered: 0,
    arrTotal: 0,
    currentMrrTotal: 0,
    converted: null,
    rate: null,
    medianDaysToNext: null,
    ...overrides,
  };
}

describe('buildFunnelSteps', () => {
  it('always returns the six steps in spine order, ending at first usage', () => {
    const steps = buildFunnelSteps([]);
    expect(steps.map((s) => s.step)).toEqual([
      'working',
      'discovery_call',
      'qualified_opportunity',
      'business_case',
      'sign_off',
      FIRST_USAGE_STEP,
    ]);
    expect(steps[5].label).toBe(FIRST_USAGE_LABEL);
    expect(steps[5].isSynthetic).toBe(true);
    expect(steps.slice(0, 5).every((s) => !s.isSynthetic)).toBe(true);
  });

  it('fills a step the RPC omitted with zero entered and null rate — never 0%', () => {
    const steps = buildFunnelSteps([
      row({ step: 'working', entered: 10, converted: 5, rate: 0.5 }),
    ]);
    const discovery = steps.find((s) => s.step === 'discovery_call')!;
    expect(discovery.entered).toBe(0);
    expect(discovery.rate).toBeNull();
    expect(discovery.converted).toBeNull();
    expect(discovery.medianDaysToNext).toBeNull();
  });

  it('nulls the rate when the cohort is empty even if the RPC sent one', () => {
    const steps = buildFunnelSteps([row({ step: 'working', entered: 0, rate: 0 })]);
    expect(steps[0].rate).toBeNull();
  });

  it('passes real cohort metrics through', () => {
    const steps = buildFunnelSteps([
      row({ step: 'sign_off', entered: 4, converted: 2, rate: 0.5, medianDaysToNext: 12.5 }),
    ]);
    const signOff = steps.find((s) => s.step === 'sign_off')!;
    expect(signOff).toMatchObject({ entered: 4, converted: 2, rate: 0.5, medianDaysToNext: 12.5 });
  });

  it('uses ARR for value, falling back to realized MRR when ARR is zero', () => {
    const steps = buildFunnelSteps([
      row({ step: 'working', entered: 2, arrTotal: 120000, currentMrrTotal: 5000 }),
      row({ step: 'discovery_call', entered: 1, arrTotal: 0, currentMrrTotal: 3000 }),
    ]);
    expect(steps[0].value).toBe(120000);
    expect(steps[1].value).toBe(3000);
  });

  it('labels spine steps with the shared short labels', () => {
    const steps = buildFunnelSteps([]);
    expect(steps.find((s) => s.step === 'discovery_call')!.label).toBe('Meeting booked');
    expect(steps.find((s) => s.step === 'qualified_opportunity')!.label).toBe('Qualified');
  });
});
