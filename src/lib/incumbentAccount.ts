/**
 * The one place that knows how the incumbent columns map onto an account row.
 *
 * It exists so the rest of the app talks in `IncumbentDraft` and never in
 * `incumbent_*` column names, and so the structural typing below is a single
 * documented seam instead of a cast scattered across three call sites.
 *
 * The row type is structural on purpose: callers and tests can build one
 * without dragging in the generated Supabase types, and the `IncumbentRow`
 * shape can be swapped for the generated Row type without any caller changing.
 *
 * PURITY RULE: `toIncumbentPatch` takes an explicit `now`, same as the rest of
 * the incumbent module.
 */
import {
  DAY_MS,
  normalizeVendor,
  toMonthAnchor,
  type IncumbentCycle,
  type IncumbentDraft,
  type IncumbentSource,
} from './incumbentWindow';

export interface IncumbentRow {
  incumbent_vendor?: string | null;
  incumbent_last_renewal?: string | null;
  incumbent_cycle?: IncumbentCycle | null;
  incumbent_evidence?: string | null;
  incumbent_source?: IncumbentSource | null;
  incumbent_captured_at?: string | null;
  incumbent_window_snoozed_until?: string | null;
  incumbent_window_disabled_reason?: string | null;
}

/**
 * Pull the incumbent columns off a raw account row, defaulted.
 *
 * Deliberately tolerant of a row that does not carry them: several query
 * payloads in the app select an explicit, narrower column list, and a missing
 * column must read as "not recorded", never as undefined leaking into the UI.
 */
export function readIncumbentColumns(row: unknown): Required<IncumbentRow> {
  const r = (row ?? {}) as IncumbentRow;
  return {
    incumbent_vendor: r.incumbent_vendor ?? null,
    incumbent_last_renewal: r.incumbent_last_renewal ?? null,
    incumbent_cycle: r.incumbent_cycle ?? 'unknown',
    incumbent_evidence: r.incumbent_evidence ?? null,
    incumbent_source: r.incumbent_source ?? null,
    incumbent_captured_at: r.incumbent_captured_at ?? null,
    incumbent_window_snoozed_until: r.incumbent_window_snoozed_until ?? null,
    incumbent_window_disabled_reason: r.incumbent_window_disabled_reason ?? null,
  };
}

export function toIncumbentDraft(
  account: IncumbentRow | null | undefined,
): IncumbentDraft {
  return {
    vendor: account?.incumbent_vendor ?? null,
    lastRenewal: account?.incumbent_last_renewal ?? null,
    cycle: account?.incumbent_cycle ?? 'unknown',
    evidence: account?.incumbent_evidence ?? null,
  };
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** The tag the nightly gate stamps on the tasks it creates. */
export const INCUMBENT_WINDOW_TAG = 'incumbent-window';

/**
 * True for a task the gate created. The bare tag marks the kind; the dated
 * `incumbent-window:<renewal>` sibling is the idempotency key and is not a
 * membership test.
 */
export function isIncumbentWindowTask(tags: readonly string[] | null | undefined): boolean {
  return (tags ?? []).includes(INCUMBENT_WINDOW_TAG);
}

/** Push the window out. Nothing else about the incumbent record changes. */
export function snoozeIncumbentPatch(days: number, now: Date): IncumbentRow {
  const until = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
      days * DAY_MS,
  );
  return { incumbent_window_snoozed_until: until.toISOString().slice(0, 10) };
}

/**
 * Retire the window permanently.
 *
 * The reason is required, not politeness: without it the same account
 * reappears every cycle with no record of why it was dismissed, and the team
 * stops trusting the queue.
 */
export function discardIncumbentPatch(reason: string): IncumbentRow {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new Error('Discarding an incumbent window requires a reason');
  }
  return { incumbent_window_disabled_reason: trimmed };
}

/**
 * Erase the captured incumbent.
 *
 * `toIncumbentPatch` returns `{}` for an empty draft, which is right for "the
 * form was never touched" and wrong for "the rep just wiped it". The caller
 * knows which one it is looking at, so the erase path is its own named patch.
 *
 * The snooze and discard columns are deliberately untouched: they belong to the
 * task actions, and with no incumbent left the window is inert anyway.
 */
export const CLEARED_INCUMBENT_PATCH: IncumbentRow = Object.freeze({
  incumbent_vendor: null,
  incumbent_last_renewal: null,
  incumbent_cycle: 'unknown',
  incumbent_evidence: null,
  incumbent_source: null,
  incumbent_captured_at: null,
});

/**
 * Build the account patch for a draft. Returns an empty object for an untouched
 * draft: opening a form and closing it must not stamp the account as asked,
 * which would make `incumbent_source` lie about where the record came from.
 */
export function toIncumbentPatch(
  draft: IncumbentDraft,
  source: IncumbentSource,
  now: Date,
): IncumbentRow {
  const vendor = normalizeVendor(draft.vendor);
  const lastRenewal = toMonthAnchor(blankToNull(draft.lastRenewal));
  const evidence = blankToNull(draft.evidence);
  const cycle = draft.cycle ?? 'unknown';

  const touched =
    vendor !== null ||
    lastRenewal !== null ||
    evidence !== null ||
    cycle !== 'unknown';

  if (!touched) return {};

  return {
    incumbent_vendor: vendor,
    incumbent_last_renewal: lastRenewal,
    incumbent_cycle: cycle,
    incumbent_evidence: evidence,
    incumbent_source: source,
    incumbent_captured_at: now.toISOString(),
  };
}
