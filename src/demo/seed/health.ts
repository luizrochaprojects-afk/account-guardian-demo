/**
 * Health scoring config: three profiles, each owning the stages it scores and
 * the metrics it scores them with. Onboarding asks "are they getting live?",
 * Customer asks "are they getting value?", and Default catches any stage
 * nobody has mapped yet.
 *
 * Weights inside a profile add up to 100, so a score is a percentage.
 */
import type { Row } from '../store';
import type { HealthMetric, HealthProfile } from '@/lib/healthTypes';
import { ORG_ID } from './org';
import { sid, type Clock } from './util';

const metric = (profile: string, key: string, m: Omit<HealthMetric, 'id' | 'profileId'>): HealthMetric => ({
  ...m,
  id: sid('metric', profile, key),
  profileId: sid('health-profile', profile),
});

export const HEALTH_PROFILES: HealthProfile[] = [
  {
    id: sid('health-profile', 'onboarding'),
    name: 'Onboarding',
    isDefault: false,
    position: 1,
    stages: ['closed_won', 'setup', 'pilot_running', 'pilot_review', 'adoption'],
    metrics: [
      metric('onboarding', 'kickoff', {
        name: 'Kickoff held with sponsor', icon: 'check', source: 'Onboarding checklist', weight: 30, type: 'boolean',
        poor: { operator: '=', value: 0 }, concerning: { operator: '=', value: 0 }, healthy: { operator: '=', value: 1 }, booleanHealthyValue: true,
      }),
      metric('onboarding', 'integration', {
        name: 'Integration progress', icon: 'activity', source: 'Setup tasks done (%)', weight: 40, type: 'percentage',
        poor: { operator: '<', value: 40 }, concerning: { operator: '<', value: 80 }, healthy: { operator: '>=', value: 80 },
      }),
      metric('onboarding', 'days-to-usage', {
        name: 'Days since signature without usage', icon: 'clock', source: 'Days', weight: 30, type: 'number',
        poor: { operator: '>', value: 30 }, concerning: { operator: '>', value: 14 }, healthy: { operator: '<=', value: 14 },
      }),
    ],
  },
  {
    id: sid('health-profile', 'customer'),
    name: 'Customer',
    isDefault: false,
    position: 0,
    stages: ['ramping', 'steady', 'expanding', 'at_risk'],
    metrics: [
      metric('customer', 'active-seats', {
        name: 'Weekly active seats', icon: 'activity', source: 'Active / licensed seats (%)', weight: 40, type: 'percentage',
        poor: { operator: '<', value: 30 }, concerning: { operator: '<', value: 60 }, healthy: { operator: '>=', value: 60 },
      }),
      metric('customer', 'nps', {
        name: 'NPS', icon: 'message', source: 'Last survey', weight: 30, type: 'number',
        poor: { operator: '<', value: 0 }, concerning: { operator: '<', value: 40 }, healthy: { operator: '>=', value: 40 },
      }),
      metric('customer', 'escalations', {
        name: 'Escalations (last 90 days)', icon: 'alert', source: 'Support tool', weight: 30, type: 'number',
        poor: { operator: '>=', value: 3 }, concerning: { operator: '>=', value: 1 }, healthy: { operator: '<', value: 1 },
      }),
    ],
  },
  {
    id: sid('health-profile', 'default'),
    name: 'Default',
    isDefault: true,
    position: 2,
    stages: [],
    metrics: [
      metric('default', 'pulse', {
        name: 'CSM pulse', icon: 'heart', source: 'CSM rating (1–10)', weight: 60, type: 'number',
        poor: { operator: '<', value: 5 }, concerning: { operator: '<', value: 8 }, healthy: { operator: '>=', value: 8 },
      }),
      metric('default', 'sponsor', {
        name: 'Executive sponsor engaged', icon: 'user', source: 'Account team', weight: 40, type: 'boolean',
        poor: { operator: '=', value: 0 }, concerning: { operator: '=', value: 0 }, healthy: { operator: '=', value: 1 }, booleanHealthyValue: true,
      }),
    ],
  },
];

export function healthTables(clock: Clock): Record<string, Row[]> {
  const created = clock.at(180);
  return {
    health_metric_profiles: HEALTH_PROFILES.map((p) => ({
      id: p.id, organization_id: ORG_ID, name: p.name, is_default: p.isDefault, position: p.position,
      created_at: created, updated_at: created,
    })),
    health_profile_stages: HEALTH_PROFILES.flatMap((p) =>
      p.stages.map((stage) => ({ id: sid('profile-stage', p.id, stage), organization_id: ORG_ID, profile_id: p.id, stage, created_at: created })),
    ),
    health_metrics: HEALTH_PROFILES.flatMap((p) =>
      p.metrics.map((m, i) => ({
        id: m.id, organization_id: ORG_ID, profile_id: p.id, name: m.name, icon: m.icon, source: m.source,
        weight: m.weight, type: m.type, poor: m.poor, concerning: m.concerning, healthy: m.healthy,
        boolean_healthy_value: m.booleanHealthyValue ?? true, position: i, created_at: created, updated_at: created,
      })),
    ),
  };
}
