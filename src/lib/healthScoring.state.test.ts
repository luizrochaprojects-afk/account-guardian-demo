import { describe, it, expect } from 'vitest';
import { getHealthState, HEALTH_STATE_LABEL } from './healthScoring';

describe('getHealthState', () => {
  it('not_configured when no metrics regardless of logs/score', () => {
    expect(getHealthState(0, 0, 0)).toBe('not_configured');
    expect(getHealthState(0, 5, 80)).toBe('not_configured');
  });
  it('no_data when metrics exist but no logs', () => {
    expect(getHealthState(3, 0, 0)).toBe('no_data');
  });
  it('thresholds: 70+ healthy, 40-69 needs_attention, <40 at_risk', () => {
    expect(getHealthState(3, 1, 70)).toBe('healthy');
    expect(getHealthState(3, 1, 69)).toBe('needs_attention');
    expect(getHealthState(3, 1, 40)).toBe('needs_attention');
    expect(getHealthState(3, 1, 39)).toBe('at_risk');
    expect(getHealthState(3, 1, 0)).toBe('at_risk');
  });
  it('not_applicable outranks every other state when the stage is unmapped', () => {
    // A pre-sale account has no profile, so it has no metrics and no logs —
    // which without this guard reads as not_configured, and a zero score reads
    // as at_risk. Neither is true of a lead.
    expect(getHealthState(0, 0, 0, { stageMapped: false })).toBe('not_applicable');
    expect(getHealthState(8, 5, 85, { stageMapped: false })).toBe('not_applicable');
  });
  it('stageMapped defaults to true so existing call sites are unaffected', () => {
    expect(getHealthState(3, 1, 80)).toBe('healthy');
    expect(getHealthState(3, 1, 80, {})).toBe('healthy');
    expect(getHealthState(3, 1, 80, { stageMapped: true })).toBe('healthy');
  });
  it('labels', () => {
    expect(HEALTH_STATE_LABEL.needs_attention).toBe('Needs attention');
    expect(HEALTH_STATE_LABEL.at_risk).toBe('At risk');
    expect(HEALTH_STATE_LABEL.no_data).toBe('No data');
    expect(HEALTH_STATE_LABEL.not_applicable).toBe('Not scored at this stage');
  });
});
