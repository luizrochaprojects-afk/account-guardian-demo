import { db } from '@/demo/db';
import type { Database } from '@/types/database';
import type { HealthMetric } from '@/lib/healthTypes';
import {
  buildMetricsSnapshot,
  computeScoreFromSnapshot,
  evaluateGrade,
  extractGrade,
  extractValue,
  type Grade,
} from '@/lib/healthScoring';

export interface RecalcResult {
  recalculated: number;
  skipped: number;
  errors: number;
  /** Number of accounts initially considered impacted */
  impacted: number;
}

/**
 * This was the capitalised legacy label `'Churned'` until 2026-08, so the guard
 * below matched nothing and churned accounts were being re-scored despite their
 * score being meant to freeze at churn. Typed against the enum so it can't
 * drift back.
 */
const CHURNED_STAGE: Database['public']['Enums']['pipeline_stage'] = 'churned';

/**
 * Resolve which account ids are impacted by a given profile right now,
 * based on the current `accounts.pipeline_stage` → `health_profile_stages` mapping.
 * Churned accounts are skipped (their score is frozen).
 */
export async function getImpactedAccountIds(params: {
  orgId: string;
  profileId: string;
  /** When true, also include accounts whose pipeline_stage is null/empty AND this profile is_default. */
  includeUnstagedIfDefault?: boolean;
  isDefaultProfile?: boolean;
}): Promise<string[]> {
  const { orgId, profileId, includeUnstagedIfDefault, isDefaultProfile } = params;

  const { data: stageRows } = await db
    .from('health_profile_stages')
    .select('stage')
    .eq('organization_id', orgId)
    .eq('profile_id', profileId);

  const stages = (stageRows || []).map(s => s.stage).filter(s => s && s !== CHURNED_STAGE);

  if (stages.length === 0 && !(includeUnstagedIfDefault && isDefaultProfile)) return [];

  // Accounts whose stage is mapped to this profile
  const ids = new Set<string>();
  if (stages.length > 0) {
    const { data } = await db
      .from('accounts')
      .select('id')
      .eq('organization_id', orgId)
      .in('pipeline_stage', stages as Database['public']['Enums']['pipeline_stage'][]);
    (data || []).forEach(a => ids.add(a.id));
  }

  // Accounts with no stage fall back to default profile
  if (includeUnstagedIfDefault && isDefaultProfile) {
    const { data } = await db
      .from('accounts')
      .select('id, pipeline_stage')
      .eq('organization_id', orgId)
      .is('pipeline_stage', null);
    (data || []).forEach(a => ids.add(a.id));
  }

  return Array.from(ids);
}

/**
 * For each impacted account, fetch its most recent log, re-grade against the new metrics
 * (using prior raw values when available, or falling back to prior grades), then write a new
 * snapshotted log. The DB trigger will sync `accounts.health_score` and `accounts.trend`.
 */
export async function recalculateForAccounts(params: {
  orgId: string;
  userId: string;
  profileId: string;
  profileName: string;
  metrics: HealthMetric[];
  accountIds: string[];
}): Promise<RecalcResult> {
  const { orgId, userId, profileId, profileName, metrics, accountIds } = params;

  let recalculated = 0;
  let skipped = 0;
  let errors = 0;

  if (accountIds.length === 0 || metrics.length === 0) {
    return { recalculated: 0, skipped: accountIds.length, errors: 0, impacted: accountIds.length };
  }

  const snapshot = buildMetricsSnapshot(metrics);
  const today = new Date().toISOString().slice(0, 10);

  // Process accounts sequentially to keep the load light and avoid races on the per-account trigger
  for (const accountId of accountIds) {
    const { data: prior } = await db
      .from('health_score_logs')
      .select('scores')
      .eq('account_id', accountId)
      .order('logged_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!prior || !prior.scores) {
      skipped++;
      continue;
    }

    const priorScores = prior.scores as Record<string, unknown>;

    // Re-grade each metric using the new thresholds.
    const newScores: Record<string, { value: number | boolean | null; grade: Grade }> = {};
    for (const m of metrics) {
      const entry = priorScores[m.id];
      const rawVal = entry !== undefined ? extractValue(entry) : null;
      let grade: Grade;
      if (rawVal !== null) {
        grade = evaluateGrade(rawVal, m);
      } else if (entry !== undefined) {
        // Legacy log: only the prior grade is available; keep it.
        grade = extractGrade(entry);
      } else {
        // Metric is brand new for this profile and we have no observation for it.
        grade = 'concerning';
      }
      newScores[m.id] = { value: rawVal, grade };
    }

    const total = computeScoreFromSnapshot(newScores as unknown as Record<string, unknown>, snapshot);

    const { error } = await db.from('health_score_logs').insert({
      account_id: accountId,
      user_id: userId,
      organization_id: orgId,
      logged_at: today,
      observation: 'Recalculated after config change',
      scores: newScores as any,
      total_score: total,
      profile_id: profileId,
      profile_name: profileName,
      metrics_snapshot: snapshot as any,
    });

    if (error) {
      console.error('Recalc insert failed for account', accountId, error);
      errors++;
    } else {
      recalculated++;
    }
  }

  return { recalculated, skipped, errors, impacted: accountIds.length };
}
