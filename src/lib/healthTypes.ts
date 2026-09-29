/**
 * Health scoring vocabulary: a metric, its three threshold rules, and the
 * profiles that map metrics to pipeline stages. Shared by the health config
 * screens, the scoring math and the recalculation job.
 */
export type MetricType = 'number' | 'percentage' | 'boolean';
export type ThresholdOperator = '<' | '<=' | '>' | '>=' | '=';

export interface ThresholdRule {
  operator: ThresholdOperator;
  value: number;
}

export interface HealthMetric {
  id: string;
  name: string;
  icon: string;
  source: string;
  weight: number;
  type: MetricType;
  poor: ThresholdRule;
  concerning: ThresholdRule;
  healthy: ThresholdRule;
  /** For boolean metrics: which boolean value maps to healthy */
  booleanHealthyValue?: boolean;
  /** Profile this metric belongs to (set when persisted; optional for in-memory creation) */
  profileId?: string;
}

export interface HealthProfile {
  id: string;
  name: string;
  isDefault: boolean;
  position: number;
  /** Lifecycle stages mapped to this profile */
  stages: string[];
  metrics: HealthMetric[];
}

export const defaultHealthMetrics: HealthMetric[] = [
  { id: 'hm-1', name: 'Product Usage', icon: 'activity', source: 'Last seen (days ago)', weight: 40, type: 'number', poor: { operator: '>=', value: 10 }, concerning: { operator: '>=', value: 5 }, healthy: { operator: '<', value: 5 } },
  { id: 'hm-2', name: 'NPS', icon: 'message', source: 'NPS', weight: 35, type: 'number', poor: { operator: '<', value: 0 }, concerning: { operator: '<', value: 50 }, healthy: { operator: '>=', value: 50 } },
  { id: 'hm-3', name: 'CSM Pulse', icon: 'heart', source: 'CSM Pulse', weight: 25, type: 'number', poor: { operator: '<', value: 7 }, concerning: { operator: '<', value: 9 }, healthy: { operator: '>=', value: 9 } },
];
