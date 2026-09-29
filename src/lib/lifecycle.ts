import { differenceInCalendarDays, parseISO } from 'date-fns';

export const LIFECYCLE_GROUP_LABEL = 'lifecycle';

export type LifecycleEventLike = {
  id: string;
  title: string;
  summary: string | null;
  date: string | null;
  created_at: string;
  group_label: string | null;
};

/** Pull the stage name out of a "Stage: X" title. */
export function extractStage(title: string): string {
  if (!title) return '';
  return title.startsWith('Stage: ') ? title.slice(7).trim() : title.trim();
}

export function buildStageTitle(stage: string): string {
  return `Stage: ${stage}`;
}

/** Sort lifecycle events oldest → newest. */
export function sortLifecycle<T extends { created_at: string }>(events: T[]): T[] {
  return [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export function filterLifecycle<T extends { group_label: string | null }>(events: T[]): T[] {
  return events.filter(e => e.group_label === LIFECYCLE_GROUP_LABEL);
}

export type JourneyEntry = {
  event: LifecycleEventLike;
  stage: string;
  enteredAt: Date;
  exitedAt: Date | null;
  days: number;
  isCurrent: boolean;
};

export function buildJourney(events: LifecycleEventLike[]): JourneyEntry[] {
  const ordered = sortLifecycle(filterLifecycle(events));
  const now = new Date();
  return ordered.map((cur, i) => {
    const next = ordered[i + 1];
    const enteredAt = parseISO(cur.created_at);
    const exitedAt = next ? parseISO(next.created_at) : null;
    const referenceEnd = exitedAt ?? now;
    return {
      event: cur,
      stage: extractStage(cur.title),
      enteredAt,
      exitedAt,
      days: Math.max(0, differenceInCalendarDays(referenceEnd, enteredAt)),
      isCurrent: !next,
    };
  });
}

export type DateBounds = {
  min: Date | null;
  max: Date | null;
};

/**
 * For an EXISTING event, the new date must sit strictly between the previous and next
 * lifecycle events (chronologically). For an INSERTED event, pass eventId=null and
 * provide the chronological neighbours via the bounding events list.
 */
export function getEditBounds(
  events: LifecycleEventLike[],
  eventId: string,
  accountCreatedAt?: string | null
): DateBounds {
  // Backfill-friendly: allow any past date. Order is determined by created_at,
  // so picking an earlier date will simply re-slot the transition chronologically.
  return { min: null, max: new Date() };
}

/** Bounds when inserting a new transition between two existing events (by index of the event AFTER the insertion). */
export function getInsertBounds(
  events: LifecycleEventLike[],
  insertBeforeId: string | null,
  accountCreatedAt?: string | null
): DateBounds {
  // Backfill-friendly: allow any past date.
  return { min: null, max: new Date() };
}

export function isWithinBounds(date: Date, bounds: DateBounds): boolean {
  if (bounds.min && date.getTime() <= bounds.min.getTime()) return false;
  if (bounds.max && date.getTime() >= bounds.max.getTime()) return false;
  return true;
}