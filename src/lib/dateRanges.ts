/**
 * Shared date-range helpers for filters like "Target end".
 *
 * All boundaries are computed in the **viewer's local timezone** so labels
 * like "This week" / "This month" / "Overdue" line up with what the user
 * sees on the calendar in front of them.
 *
 * `target_end_at` values are stored as date-only strings (`yyyy-MM-dd`).
 * `new Date('yyyy-MM-dd')` parses as **UTC midnight**, which can fall on
 * the previous local day in negative-UTC timezones. We normalize by
 * splitting the string and constructing a local-midnight Date.
 */
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
} from "date-fns";

export type TargetEndBucket = "any" | "overdue" | "this_week" | "this_month" | "no_date";

/**
 * Bucket used by the **Issues "Due"** filter. Adds `today` / `tomorrow` to the
 * project-level `TargetEndBucket` so a CSM can quickly slice "what's on fire
 * right now" vs "what hits this week".
 */
export type DueDateBucket =
  | "any"
  | "overdue"
  | "today"
  | "tomorrow"
  | "this_week"
  | "this_month"
  | "no_date";

/**
 * Parse a `yyyy-MM-dd` (or full ISO) date string into a local-midnight Date.
 * Returns null for empty/invalid input.
 */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Date-only form: build in local time to avoid UTC shift.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Test whether a stored target-end date matches the chosen bucket,
 * using the local calendar (not rolling N-day windows).
 *
 * - `overdue`     → strictly before start-of-today
 * - `this_week`   → within Mon-start..Sun-end of the current local week
 * - `this_month`  → within start..end of the current local calendar month
 * - `no_date`     → no target date set
 * - `any`         → always true
 */
export function matchesTargetEnd(
  rawDate: string | null | undefined,
  bucket: TargetEndBucket,
  now: Date = new Date(),
): boolean {
  if (bucket === "any") return true;
  const d = parseLocalDate(rawDate);
  if (bucket === "no_date") return d === null;
  if (d === null) return false;

  const t = d.getTime();
  const today = startOfDay(now).getTime();
  if (bucket === "overdue") return t < today;
  if (bucket === "this_week") {
    const ws = startOfWeek(now, { weekStartsOn: 1 }).getTime();
    const we = endOfWeek(now, { weekStartsOn: 1 }).getTime();
    return t >= ws && t <= we;
  }
  if (bucket === "this_month") {
    const ms = startOfMonth(now).getTime();
    const me = endOfMonth(now).getTime();
    return t >= ms && t <= me;
  }
  return true;
}

/**
 * Test whether a stored due date matches the chosen `DueDateBucket`. Mirrors
 * `matchesTargetEnd` but also handles the issues-only `today` / `tomorrow`
 * buckets in the viewer's local timezone.
 */
export function matchesDueDate(
  rawDate: string | null | undefined,
  bucket: DueDateBucket,
  now: Date = new Date(),
): boolean {
  if (bucket === "any") return true;
  const d = parseLocalDate(rawDate);
  if (bucket === "no_date") return d === null;
  if (d === null) return false;

  const t = d.getTime();
  const today = startOfDay(now).getTime();
  if (bucket === "overdue") return t < today;
  if (bucket === "today") {
    return t >= today && t <= endOfDay(now).getTime();
  }
  if (bucket === "tomorrow") {
    const tom = addDays(now, 1);
    return t >= startOfDay(tom).getTime() && t <= endOfDay(tom).getTime();
  }
  if (bucket === "this_week") {
    const ws = startOfWeek(now, { weekStartsOn: 1 }).getTime();
    const we = endOfWeek(now, { weekStartsOn: 1 }).getTime();
    return t >= ws && t <= we;
  }
  if (bucket === "this_month") {
    const ms = startOfMonth(now).getTime();
    const me = endOfMonth(now).getTime();
    return t >= ms && t <= me;
  }
  return true;
}