import type { HealthProfile } from '@/lib/healthTypes';
import { PIPELINE_PHASES } from '@/lib/pipelinePhases';

/**
 * Stages a brand-new org's Default profile claims: everything from Onboarding
 * onwards, minus `churned` (a churned account's score is frozen — see
 * `getImpactedAccountIds`, which excludes it from recalculation).
 *
 * Derived from PIPELINE_PHASES rather than spelled out, so adding a stage to
 * the board can't leave this list behind. The previous hard-coded version
 * ('Lead', 'Pilot — Setup', …) is exactly how the two key spaces drifted apart.
 */
export const DEFAULT_SCORED_STAGES: string[] = PIPELINE_PHASES
  .filter(p => p.phase === 'onboarding' || p.phase === 'customer')
  .flatMap(p => p.stages.map(s => s.key))
  .filter(key => key !== 'churned');

/**
 * Which health profile scores an account, given its `pipeline_stage`.
 *
 * ⚠️ The three branches below are NOT interchangeable, and conflating the last
 * two is the bug this file exists to prevent.
 *
 * Falling back to the default profile for *any* unmatched stage hides key-space
 * drift: if `health_profile_stages.stage` ever holds free-text labels
 * ('Customer', 'Pilot — Setup', …) instead of `pipeline_stage` keys, every
 * account silently resolves to the default profile and the UI shows a
 * plausible score computed with the wrong metric set instead of an error.
 *
 * So: an unmapped stage now returns `null`, and callers must render that as its
 * own state rather than as a score. "We have no metrics for this phase" and
 * "here are the default metrics" are different claims.
 */
export function resolveProfileForStage(
  profiles: HealthProfile[],
  stage: string | null | undefined,
): HealthProfile | null {
  if (!profiles.length) return null;

  // A stage that some profile claims → that profile.
  if (stage) {
    return profiles.find(p => p.stages.includes(stage)) ?? null;
  }

  // No stage at all (account never placed on the board) → default profile.
  // This mirrors `getImpactedAccountIds`'s `includeUnstagedIfDefault`, which
  // already treats a null stage as belonging to the default profile.
  return profiles.find(p => p.isDefault) ?? profiles[0] ?? null;
}
