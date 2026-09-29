/**
 * classify_customer_stages — files every live customer on the priority ladder.
 *
 * In production this is a nightly SQL job; the "Reclassify" button on the
 * Customer board runs it on demand. Here it runs the TypeScript classifier
 * (src/lib/customerSignals.ts) over the account_customer_signals view and
 * writes stage + risk reason the same way the job does: through the stage
 * guard with the classifier flag raised, so the history row records
 * source = 'classifier'.
 *
 * Returns one row per account that actually moved.
 */
import type { Row, Store } from '../store';
import { withSetting } from '../runtime';
import { phaseForStage, type PipelineStage } from '@/lib/pipelineStages';
import {
  classifyCustomerStage,
  DEFAULT_CUSTOMER_THRESHOLDS,
  type CustomerSignals,
  type CustomerThresholds,
} from '@/lib/customerSignals';
import { getUserOrgId } from './auth';

export function toCustomerSignals(r: Row): CustomerSignals {
  return {
    accountId: r.account_id,
    pipelineStage: r.pipeline_stage,
    customerSince: r.customer_since ?? null,
    firstUsageAt: r.first_usage_at ?? null,
    lastUsageAt: r.last_usage_at ?? null,
    reactivatedAt: r.reactivated_at ?? null,
    customerStagePinnedAt: r.customer_stage_pinned_at ?? null,
    usage4w: Number(r.usage_4w) || 0,
    usagePrev4w: Number(r.usage_prev_4w) || 0,
    usageDeltaPct: r.usage_delta_pct ?? null,
    weeksSinceLastUsage: r.weeks_since_last_usage ?? null,
    daysSinceLastActivity: r.days_since_last_activity ?? null,
    healthScore: r.health_score ?? null,
    healthLoggedAt: r.health_logged_at ?? null,
    cohort: r.cohort ?? null,
    signalQuality: r.signal_quality ?? 'none',
  };
}

export function thresholdsFor(store: Store, orgId: string): CustomerThresholds {
  const s = store.table('org_settings').find((o) => o.organization_id === orgId);
  if (!s) return DEFAULT_CUSTOMER_THRESHOLDS;
  return {
    expansionThresholdPct: s.customer_expansion_threshold_pct ?? DEFAULT_CUSTOMER_THRESHOLDS.expansionThresholdPct,
    contractionThresholdPct: s.customer_contraction_threshold_pct ?? DEFAULT_CUSTOMER_THRESHOLDS.contractionThresholdPct,
    dormantWeeks: s.customer_dormant_weeks ?? DEFAULT_CUSTOMER_THRESHOLDS.dormantWeeks,
    goneDarkDays: s.customer_gone_dark_days ?? DEFAULT_CUSTOMER_THRESHOLDS.goneDarkDays,
    rampDays: s.customer_ramp_days ?? DEFAULT_CUSTOMER_THRESHOLDS.rampDays,
  };
}

export function classifyCustomerStages(store: Store, args: { _org_id?: string | null }): Row[] {
  const orgId = args._org_id ?? getUserOrgId(store);
  const cfg = thresholdsFor(store, orgId);
  const now = Date.now();
  const moved: Row[] = [];

  const signals = store.table('account_customer_signals').filter((r) => r.organization_id === orgId);
  for (const row of signals) {
    const churnedAt =
      row.pipeline_stage === 'churned'
        ? (store
            .table('account_stage_history')
            .filter((h) => h.account_id === row.account_id && h.to_stage === 'churned')
            .sort((a, b) => String(b.entered_at).localeCompare(String(a.entered_at)))[0]?.entered_at ?? null)
        : null;
    const result = classifyCustomerStage(toCustomerSignals(row), cfg, now, churnedAt);
    if (!result) continue;
    if (result.stage === row.pipeline_stage && result.riskReason === (row.customer_risk_reason ?? null)) continue;

    const stage = result.stage as PipelineStage;
    const patch: Row = {
      pipeline_stage: stage,
      pipeline_phase: phaseForStage(stage),
      customer_risk_reason: result.riskReason,
    };
    if (result.rule === 'reactivation') patch.reactivated_at = new Date(now).toISOString();

    withSetting('app.customer_classifier_active', 'true', () =>
      withSetting('app.system_stage_advance', 'true', () =>
        store.update('accounts', (a) => a.id === row.account_id, patch),
      ),
    );
    moved.push({ account_id: row.account_id, from_stage: row.pipeline_stage, to_stage: stage, rule: result.rule });
  }
  return moved;
}
