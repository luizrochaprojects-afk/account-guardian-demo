import { describe, it, expect } from 'vitest';
import { DEFAULT_SCORED_STAGES, resolveProfileForStage } from './healthProfiles';
import type { HealthProfile } from '@/lib/healthTypes';

function profile(over: Partial<HealthProfile> & { id: string }): HealthProfile {
  return {
    name: over.id,
    isDefault: false,
    position: 0,
    stages: [],
    metrics: [],
    ...over,
  };
}

const onboarding = profile({
  id: 'onboarding',
  isDefault: true,
  stages: ['closed_won', 'setup', 'pilot_running', 'pilot_review', 'adoption'],
});
const customer = profile({
  id: 'customer',
  stages: ['ramping', 'steady', 'expanding', 'at_risk'],
});
const profiles = [onboarding, customer];

describe('resolveProfileForStage', () => {
  it('returns the profile that claims the stage', () => {
    expect(resolveProfileForStage(profiles, 'steady')?.id).toBe('customer');
    expect(resolveProfileForStage(profiles, 'setup')?.id).toBe('onboarding');
  });

  it('returns null for a stage no profile claims — NOT the default profile', () => {
    // The regression this file exists for: pre-sale stages used to silently
    // inherit the default profile's metrics and produce a plausible score.
    expect(resolveProfileForStage(profiles, 'target')).toBeNull();
    expect(resolveProfileForStage(profiles, 'discovery_call')).toBeNull();
    expect(resolveProfileForStage(profiles, 'churned')).toBeNull();
  });

  it('returns null for legacy free-text labels', () => {
    // Free-text labels are not stage keys. If they ever show up in
    // health_profile_stages, they must not resolve to anything.
    expect(resolveProfileForStage(profiles, 'Customer')).toBeNull();
    expect(resolveProfileForStage(profiles, 'Pilot — Setup')).toBeNull();
  });

  it('falls back to the default profile when the account has no stage', () => {
    expect(resolveProfileForStage(profiles, null)?.id).toBe('onboarding');
    expect(resolveProfileForStage(profiles, undefined)?.id).toBe('onboarding');
    expect(resolveProfileForStage(profiles, '')?.id).toBe('onboarding');
  });

  it('falls back to the first profile when none is marked default', () => {
    const noDefault = [customer, profile({ id: 'other' })];
    expect(resolveProfileForStage(noDefault, null)?.id).toBe('customer');
  });

  it('returns null when there are no profiles at all', () => {
    expect(resolveProfileForStage([], 'steady')).toBeNull();
    expect(resolveProfileForStage([], null)).toBeNull();
  });
});

describe('DEFAULT_SCORED_STAGES', () => {
  it('covers onboarding and customer, and only real enum values', () => {
    expect(DEFAULT_SCORED_STAGES).toContain('setup');
    expect(DEFAULT_SCORED_STAGES).toContain('adoption');
    expect(DEFAULT_SCORED_STAGES).toContain('steady');
    expect(DEFAULT_SCORED_STAGES).toContain('at_risk');
  });
  it('excludes pre-sale stages and churned', () => {
    expect(DEFAULT_SCORED_STAGES).not.toContain('target');
    expect(DEFAULT_SCORED_STAGES).not.toContain('discovery_call');
    expect(DEFAULT_SCORED_STAGES).not.toContain('churned');
  });
});
