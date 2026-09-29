/**
 * "Near the money": the default screen of the weekly pipeline review.
 *
 * The pipeline ordered bottom-up: the closer a deal is to producing revenue,
 * the higher it sits, and inside each stage the biggest projected MRR first.
 * The red line is worked before anything else today.
 *
 * Pure on purpose (same reasoning as pipelineHygiene.ts): ordering and status
 * are the point of this screen, so they must be testable without a renderer.
 */

import type { HygieneFlagRow } from '@/lib/hygieneCounters';

/**
 * Bottom-up order. pilot_running (go-live
 * with real usage — the true "won") is deliberately absent: once usage exists
 * the account belongs to ramp tracking, not to the money list. The "near money,
 * stalled" counter still hunts the pilot_running accounts with no usage.
 */
export const MONEY_STAGES = [
  'setup',                 // go-live pending
  'closed_won',            // "go" approved
  'sign_off',              // pricing & plan / approvals
  'business_case',         // demo → trial
  'qualified_opportunity', // qualified
] as const;

export type MoneyStage = (typeof MONEY_STAGES)[number];

export type MoneyStatus = 'emergency' | 'uncovered' | 'attention' | 'ok';

export interface MoneyAccountInput {
  id: string;
  name: string;
  pipeline_stage: string | null;
  mrr: number | null;
  arr: number | null;
  next_step: string | null;
  next_step_due: string | null;
}

export interface MoneyRow {
  id: string;
  name: string;
  stage: MoneyStage;
  /** Projected MRR: mrr, falling back to arr/12 when mrr is unset. */
  projectedMonthly: number;
  daysInStage: number | null;
  nextStep: string | null;
  nextStepDue: string | null;
  status: MoneyStatus;
  /** The flag that decided the status — shown as the pill's tooltip/detail. */
  statusDetail: string | null;
}

const STAGE_RANK: Record<string, number> = Object.fromEntries(
  MONEY_STAGES.map((s, i) => [s, i]),
);

const DAY_MS = 86_400_000;

/**
 * Status severity, worst wins:
 * emergency = near money and stalled, or a broken commitment (overdue);
 * uncovered = no next step / no future meeting;
 * attention = stuck in stage or missing data.
 */
const FLAG_STATUS: Record<string, MoneyStatus> = {
  near_money_stalled: 'emergency',
  next_step_overdue: 'emergency',
  no_next_step: 'uncovered',
  no_future_meeting: 'uncovered',
  stuck_in_stage: 'attention',
  missing_incumbent: 'attention',
  missing_contact_roles: 'attention',
  missing_basics: 'attention',
};

const STATUS_RANK: Record<MoneyStatus, number> = {
  emergency: 0,
  uncovered: 1,
  attention: 2,
  ok: 3,
};

export function buildMoneyRows(
  accounts: readonly MoneyAccountInput[],
  /** account_id → entered_at ISO of the open stage_history row. */
  stageEnteredAt: Readonly<Record<string, string>>,
  hygieneRows: readonly HygieneFlagRow[],
  now: number = Date.now(),
): MoneyRow[] {
  const flagsByAccount = new Map<string, HygieneFlagRow[]>();
  for (const r of hygieneRows) {
    const list = flagsByAccount.get(r.accountId);
    if (list) list.push(r);
    else flagsByAccount.set(r.accountId, [r]);
  }

  return accounts
    .filter((a): a is MoneyAccountInput & { pipeline_stage: MoneyStage } =>
      !!a.pipeline_stage && a.pipeline_stage in STAGE_RANK,
    )
    .map((a): MoneyRow => {
      let status: MoneyStatus = 'ok';
      let statusDetail: string | null = null;
      for (const f of flagsByAccount.get(a.id) ?? []) {
        const s = FLAG_STATUS[f.flag];
        if (s && STATUS_RANK[s] < STATUS_RANK[status]) {
          status = s;
          statusDetail = f.detail;
        }
      }

      const entered = stageEnteredAt[a.id];
      const enteredMs = entered ? new Date(entered).getTime() : NaN;

      return {
        id: a.id,
        name: a.name,
        stage: a.pipeline_stage,
        projectedMonthly: (a.mrr ?? 0) > 0 ? a.mrr! : (Number(a.arr) || 0) / 12,
        daysInStage: Number.isFinite(enteredMs) ? Math.floor((now - enteredMs) / DAY_MS) : null,
        nextStep: a.next_step,
        nextStepDue: a.next_step_due,
        status,
        statusDetail,
      };
    })
    .sort((x, y) => {
      const byStage = STAGE_RANK[x.stage] - STAGE_RANK[y.stage];
      if (byStage !== 0) return byStage;
      const byMoney = y.projectedMonthly - x.projectedMonthly;
      if (byMoney !== 0) return byMoney;
      return x.name.localeCompare(y.name);
    });
}
