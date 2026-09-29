/**
 * The incumbent renewal window, in TypeScript.
 *
 * ⚠️ THIS FILE IS A MIRROR, NOT A SECOND IMPLEMENTATION.
 * On a live backend a SQL view computes the same dates and a nightly job is
 * what actually creates the task. This module exists so the
 * UI can render and explain a window without a round trip, and so the rules are
 * testable at all. Same deliberate duplication as customerSignals.ts: if you
 * change a rule here, change it there in the SAME commit.
 *
 * PURITY RULE, same as portfolioMath.ts and customerSignals.ts: no `Date.now()`,
 * no I/O. Anything time-dependent takes an explicit `now`.
 *
 * The modelling choice that drives everything: a prospect never states a renewal
 * date, they state an anchor ("we renew in January") and a cycle ("it's an
 * annual contract"). We store those two and derive the rest, which means the window
 * re-arms itself every cycle instead of going stale the first time it passes.
 */

export const DAY_MS = 86_400_000;

/**
 * How far ahead of the renewal the window opens. 90 days because a B2B renewal
 * decision starts 3 to 4 months out; alerting on the renewal date itself is
 * arriving after the signature.
 *
 * Org-configurable via `org_settings.incumbent_lead_days`. This default MUST
 * match the SQL default or a window rendered before settings load would
 * disagree with the one rendered after.
 */
export const DEFAULT_INCUMBENT_LEAD_DAYS = 90;

export type IncumbentCycle = 'annual' | 'biennial' | 'monthly' | 'unknown';

/** Where the incumbent data came from. Mirrors the `source` idiom already used
 *  by the qualification checklist items. */
export type IncumbentSource = 'human' | 'agent' | 'import';

/**
 * - `none`      no anchor, or a cycle we refuse to guess at
 * - `scheduled` the window is real but still ahead
 * - `open`      today sits between the opening date and the renewal
 * - `snoozed`   a human pushed it out
 * - `disabled`  a human discarded it permanently, with a reason
 *
 * There is deliberately no `passed`: once the renewal date goes by, the account
 * has re-signed and the next cycle's window is what matters, so the state falls
 * back to `scheduled`.
 */
export type IncumbentWindowState =
  | 'none'
  | 'scheduled'
  | 'open'
  | 'snoozed'
  | 'disabled';

/** Structural on purpose so tests and the cron's fixtures can build one without
 *  dragging in the generated Supabase types. */
export interface IncumbentInput {
  /** `accounts.incumbent_last_renewal`. Month precision: always day 1. */
  lastRenewal: string | null;
  cycle: IncumbentCycle;
  snoozedUntil?: string | null;
  disabledReason?: string | null;
}

/**
 * What a human actually types. `IncumbentInput` is the subset the window math
 * needs; this is that plus the two fields that make the eventual task readable.
 */
export interface IncumbentDraft extends IncumbentInput {
  vendor: string | null;
  evidence: string | null;
}

export interface IncumbentWindow {
  state: IncumbentWindowState;
  /** ISO date of the next renewal we believe in, or null when uncomputable. */
  nextRenewalEstimate: string | null;
  /** ISO date the window opens. */
  opensAt: string | null;
  /** Days until the window opens. Negative means it has been open that long. */
  daysUntilOpen: number | null;
}

const CYCLE_MONTHS: Record<Exclude<IncumbentCycle, 'unknown'>, number> = {
  monthly: 1,
  annual: 12,
  biennial: 24,
};

/**
 * Collapse a date to the first of its month.
 *
 * Anchors are stored at month precision because that is the precision a prospect
 * actually speaks in. Normalizing on the way in keeps every downstream
 * comparison exact instead of half-exact.
 */
export function toMonthAnchor(date: string | null | undefined): string | null {
  if (!date) return null;
  return `${date.slice(0, 7)}-01`;
}

/**
 * Suggested incumbent labels. Deliberately category-neutral: the point is to
 * give reps a few canonical spellings to converge on, plus an escape hatch.
 *
 * A list, not an enum, and free text underneath: the landscape shifts faster
 * than a migration cadence, and a rep blocked by a missing option types nothing
 * at all. `normalizeVendor` is what keeps later aggregation honest.
 */
export const KNOWN_INCUMBENT_VENDORS = [
  'Legacy CRM',
  'In-house tool',
  'Spreadsheets',
  'Other',
] as const;

const VENDOR_BY_LOWER = new Map(
  KNOWN_INCUMBENT_VENDORS.map((v) => [v.toLowerCase(), v as string]),
);

/**
 * Snap a typed vendor onto its canonical label when we recognize it, so that
 * "legacy crm" and "Legacy CRM" do not become two rows the day someone asks who we lose
 * to. Anything unrecognized survives as typed.
 */
export function normalizeVendor(vendor: string | null | undefined): string | null {
  const trimmed = vendor?.trim();
  if (!trimmed) return null;
  return VENDOR_BY_LOWER.get(trimmed.toLowerCase()) ?? trimmed;
}

/** UTC midnight of an ISO date, as epoch ms. */
function parseIso(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** UTC midnight of `now`. Everything compares day-to-day, never instant-to-instant. */
function startOfUtcDay(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Safe because every anchor is day 1, so no month-length overflow is possible. */
function addMonths(anchorMs: number, months: number): number {
  const d = new Date(anchorMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1);
}

const EMPTY = {
  nextRenewalEstimate: null,
  opensAt: null,
  daysUntilOpen: null,
} as const;

export function computeIncumbentWindow(
  incumbent: IncumbentInput,
  now: Date,
  leadDays: number = DEFAULT_INCUMBENT_LEAD_DAYS,
): IncumbentWindow {
  if (incumbent.disabledReason?.trim()) {
    return { ...EMPTY, state: 'disabled' };
  }

  const anchorIso = toMonthAnchor(incumbent.lastRenewal);
  if (!anchorIso || incumbent.cycle === 'unknown') {
    return { ...EMPTY, state: 'none' };
  }

  const today = startOfUtcDay(now);
  const anchor = parseIso(anchorIso);
  const step = CYCLE_MONTHS[incumbent.cycle];

  // Jump straight to the right cycle instead of looping from the anchor: a
  // monthly contract anchored years back would otherwise iterate dozens of times.
  const anchorDate = new Date(anchor);
  const todayDate = new Date(today);
  const monthsApart =
    (todayDate.getUTCFullYear() - anchorDate.getUTCFullYear()) * 12 +
    (todayDate.getUTCMonth() - anchorDate.getUTCMonth());

  let k = Math.max(0, Math.ceil(monthsApart / step));
  let next = addMonths(anchor, k * step);
  // The month can be right while the day is not: an anchor on the 1st has
  // already passed if today is the 15th of the same month.
  while (next < today) {
    k += 1;
    next = addMonths(anchor, k * step);
  }

  const opensAt = next - leadDays * DAY_MS;
  const daysUntilOpen = Math.round((opensAt - today) / DAY_MS);

  const snoozedUntil = incumbent.snoozedUntil
    ? parseIso(incumbent.snoozedUntil)
    : null;

  const state: IncumbentWindowState =
    snoozedUntil !== null && snoozedUntil > today
      ? 'snoozed'
      : today >= opensAt
        ? 'open'
        : 'scheduled';

  return {
    state,
    nextRenewalEstimate: formatIso(next),
    opensAt: formatIso(opensAt),
    daysUntilOpen,
  };
}
