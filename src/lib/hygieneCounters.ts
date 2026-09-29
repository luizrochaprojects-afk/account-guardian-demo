/**
 * The zero-target hygiene counters, presentation grain. The server computes
 * flags per account (the account_hygiene_flags RPC); this module owns the
 * vocabulary, ordering and the owner × flag aggregation the counter board
 * renders.
 *
 * Every counter targets zero, and each one implies an action. A board of
 * zeroes is the goal state, not an empty state.
 *
 * Pure on purpose: the grid math must be testable without rendering a hook.
 *
 * Flag keys are a contract with the RPC — change them in both places or the
 * board silently drops a counter.
 */

export const HYGIENE_FLAGS = [
  'near_money_stalled',
  'no_next_step',
  'next_step_overdue',
  'no_future_meeting',
  'stuck_in_stage',
  'missing_contact_roles',
  'missing_basics',
] as const;

export type HygieneFlag = (typeof HYGIENE_FLAGS)[number];

/**
 * crit = same-day rule ("no red alert survives the day"); warn = clears within
 * the week.
 */
export const FLAG_META: Record<HygieneFlag, { label: string; severity: 'crit' | 'warn'; counter: string }> = {
  near_money_stalled:     { label: 'Near money, stalled',       severity: 'crit', counter: '1' },
  // Covers two states — no open task, and an open task without a date (either
  // missing counts). The label says both: "No next step" on an account that
  // has an open task reads as a bug in the board, and the drill-down detail
  // separates the cases.
  no_next_step:           { label: 'Next step or date missing', severity: 'crit', counter: '2' },
  next_step_overdue:      { label: 'Next step overdue',         severity: 'crit', counter: '3' },
  no_future_meeting:      { label: 'No future meeting',         severity: 'crit', counter: '4' },
  stuck_in_stage:         { label: 'Stuck in stage',            severity: 'warn', counter: '5' },
  missing_contact_roles:  { label: 'Champion/sponsor missing',  severity: 'warn', counter: '6' },
  missing_basics:         { label: 'Basics missing',            severity: 'warn', counter: '7' },
};

/** One row of the account_hygiene_flags RPC, camel-cased by the hook. */
export interface HygieneFlagRow {
  accountId: string;
  accountName: string;
  pipelineStage: string | null;
  flag: string;
  detail: string | null;
  ownerUserId: string | null;
  ownerDisplayName: string | null;
}

export interface OwnerCounters {
  /** null = account has no owner yet — surfaced, not hidden. */
  ownerUserId: string | null;
  ownerDisplayName: string;
  counts: Partial<Record<HygieneFlag, number>>;
  total: number;
}

export interface CounterBoard {
  owners: OwnerCounters[];
  totals: Partial<Record<HygieneFlag, number>>;
  grandTotal: number;
}

export const UNASSIGNED_LABEL = 'Unassigned';

const isKnownFlag = (f: string): f is HygieneFlag =>
  (HYGIENE_FLAGS as readonly string[]).includes(f);

/**
 * Owner × flag counts. Unknown flags coming from a newer server are dropped
 * rather than crashing the board — the schema ships before the frontend, so
 * that window is real.
 *
 * Owners are sorted by name; the unassigned bucket always sinks to the end so
 * the real owners keep stable positions across days.
 */
export function buildCounterBoard(rows: readonly HygieneFlagRow[]): CounterBoard {
  const byOwner = new Map<string, OwnerCounters>();
  const totals: Partial<Record<HygieneFlag, number>> = {};
  let grandTotal = 0;

  for (const row of rows) {
    if (!isKnownFlag(row.flag)) continue;

    const key = row.ownerUserId ?? '';
    let owner = byOwner.get(key);
    if (!owner) {
      owner = {
        ownerUserId: row.ownerUserId,
        ownerDisplayName: row.ownerUserId
          ? row.ownerDisplayName || 'Unknown owner'
          : UNASSIGNED_LABEL,
        counts: {},
        total: 0,
      };
      byOwner.set(key, owner);
    }

    owner.counts[row.flag] = (owner.counts[row.flag] ?? 0) + 1;
    owner.total += 1;
    totals[row.flag] = (totals[row.flag] ?? 0) + 1;
    grandTotal += 1;
  }

  const owners = [...byOwner.values()].sort((a, b) => {
    if (a.ownerUserId === null) return 1;
    if (b.ownerUserId === null) return -1;
    return a.ownerDisplayName.localeCompare(b.ownerDisplayName);
  });

  return { owners, totals, grandTotal };
}

/** Rows behind one cell of the board, for the inline drill-down. */
export function rowsForCell(
  rows: readonly HygieneFlagRow[],
  flag: HygieneFlag,
  ownerUserId: string | null,
): HygieneFlagRow[] {
  return rows.filter((r) => r.flag === flag && r.ownerUserId === ownerUserId);
}
