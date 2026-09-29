import type { HealthMetric, ThresholdRule } from '@/lib/healthTypes';

export type Grade = 'healthy' | 'concerning' | 'poor';

export const scoreMultiplier: Record<Grade, number> = {
  healthy: 1.0,
  concerning: 0.5,
  poor: 0.1,
};

function checkThreshold(value: number, rule: ThresholdRule): boolean {
  switch (rule.operator) {
    case '<': return value < rule.value;
    case '<=': return value <= rule.value;
    case '>': return value > rule.value;
    case '>=': return value >= rule.value;
    case '=': return value === rule.value;
    default: return false;
  }
}

export function evaluateGrade(value: number | boolean, metric: HealthMetric): Grade {
  if (metric.type === 'boolean') {
    return value === (metric.booleanHealthyValue ?? true) ? 'healthy' : 'poor';
  }
  const numVal = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  // Check poor first (most restrictive), then healthy, then default to concerning
  if (checkThreshold(numVal, metric.poor)) return 'poor';
  if (checkThreshold(numVal, metric.healthy)) return 'healthy';
  return 'concerning';
}

/** Extract grade from a scores entry — handles both old string format and new {value, grade} format */
export function extractGrade(entry: unknown): Grade {
  if (typeof entry === 'string') return entry as Grade;
  if (entry && typeof entry === 'object' && 'grade' in entry) return (entry as { grade: Grade }).grade;
  return 'concerning';
}

/** Extract raw value from a scores entry (new format only) */
export function extractValue(entry: unknown): number | boolean | null {
  if (entry && typeof entry === 'object' && 'value' in entry) return (entry as { value: number | boolean }).value;
  return null;
}

/**
 * Snapshot of a single metric's configuration as captured on a health log row.
 * Stored in `health_score_logs.metrics_snapshot` so historical breakdowns/scores
 * remain anchored to the config that was active when the log was saved.
 */
export interface MetricSnapshotEntry {
  id: string;
  name: string;
  weight: number;
  type: HealthMetric['type'];
  icon?: string;
  source?: string;
  poor: ThresholdRule;
  concerning: ThresholdRule;
  healthy: ThresholdRule;
  boolean_healthy_value?: boolean;
}

/** Build a snapshot array from the live HealthMetric[] of a profile. */
export function buildMetricsSnapshot(metrics: HealthMetric[]): MetricSnapshotEntry[] {
  return metrics.map(m => ({
    id: m.id,
    name: m.name,
    weight: m.weight,
    type: m.type,
    icon: m.icon,
    source: m.source,
    poor: m.poor,
    concerning: m.concerning,
    healthy: m.healthy,
    boolean_healthy_value: m.booleanHealthyValue ?? true,
  }));
}

/** Convert a snapshot entry back into a HealthMetric-shaped object for UI reuse. */
export function snapshotToMetric(s: MetricSnapshotEntry): HealthMetric {
  return {
    id: s.id,
    name: s.name,
    icon: s.icon ?? 'eye',
    source: s.source ?? '',
    weight: s.weight,
    type: s.type,
    poor: s.poor,
    concerning: s.concerning,
    healthy: s.healthy,
    booleanHealthyValue: s.boolean_healthy_value ?? true,
  };
}

/**
 * Resolve the metric set to use when reading a log:
 * - prefer the immutable `metrics_snapshot` saved on the row,
 * - else fall back to the current profile's metrics (legacy logs).
 */
export function getLogMetrics(
  log: { metrics_snapshot?: unknown } | null | undefined,
  fallback: HealthMetric[],
): HealthMetric[] {
  const snap = log?.metrics_snapshot;
  if (Array.isArray(snap) && snap.length > 0) {
    return (snap as MetricSnapshotEntry[]).map(snapshotToMetric);
  }
  return fallback;
}

/** Recompute a total score using a snapshot's weights and the saved scores entries. */
export function computeScoreFromSnapshot(
  scores: Record<string, unknown>,
  snapshot: MetricSnapshotEntry[],
): number {
  let total = 0;
  for (const s of snapshot) {
    const grade = extractGrade(scores[s.id]);
    total += Math.round(s.weight * scoreMultiplier[grade]);
  }
  return total;
}

export type HealthStatus = 'healthy' | 'concerning' | 'poor' | 'no_data';

/**
 * Band cutoffs, named so they stop being re-typed as literals.
 *
 * Duplicated literals drift: two call sites with bands of the same name and
 * different cutoffs make "at risk" mean two things. One constant, 70/40, used
 * by the badges, the health page and the dashboard alike.
 *
 * `public.dashboard_health_distribution` hardcodes the same two numbers (it
 * cannot import TS). If you change these, change that SQL CASE too.
 */
export const HEALTH_THRESHOLD_HEALTHY = 70;
export const HEALTH_THRESHOLD_CONCERNING = 40;

/** Map a logged health score to the display status used by badges/dots. */
export function scoreToHealthStatus(score: number | null): HealthStatus {
  if (score === null) return 'no_data';
  if (score >= HEALTH_THRESHOLD_HEALTHY) return 'healthy';
  if (score >= HEALTH_THRESHOLD_CONCERNING) return 'concerning';
  return 'poor';
}

export type HealthState =
  | 'not_applicable'
  | 'not_configured'
  | 'no_data'
  | 'healthy'
  | 'needs_attention'
  | 'at_risk';

export const HEALTH_STATE_LABEL: Record<HealthState, string> = {
  not_applicable: 'Not scored at this stage',
  not_configured: 'Not configured',
  no_data: 'No data',
  healthy: 'Healthy',
  needs_attention: 'Needs attention',
  at_risk: 'At risk',
};

/**
 * `stageMapped: false` means the account's pipeline stage belongs to no health
 * profile — a pre-sale account, typically. That outranks every other state:
 * there is no metric set to be un-configured against and no score to band, so
 * checking it first is what keeps a lead from being reported as "at risk".
 *
 * It defaults to `true` so existing call sites keep their behaviour; only
 * callers that actually resolve a profile need to pass it.
 */
export function getHealthState(
  metricCount: number,
  logCount: number,
  score: number,
  opts?: { stageMapped?: boolean },
): HealthState {
  if (opts?.stageMapped === false) return 'not_applicable';
  if (metricCount === 0) return 'not_configured';
  if (logCount === 0) return 'no_data';
  if (score >= HEALTH_THRESHOLD_HEALTHY) return 'healthy';
  if (score >= HEALTH_THRESHOLD_CONCERNING) return 'needs_attention';
  return 'at_risk';
}
