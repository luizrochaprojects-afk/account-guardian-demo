/**
 * Splitting issues into "still being worked on" vs "finished".
 *
 * The `status === 'done' || status === 'cancelled'` check is repeated across the
 * app (Tasks page, viewFilters, IssueDetailPanel); this is its canonical home.
 */

export type TerminalCheckable = string | null | undefined;

/** True when a status means the issue is off the board (completed or dropped). */
export function isTerminalStatus(status: TerminalCheckable): boolean {
  return status === 'done' || status === 'cancelled';
}

interface SortableIssue {
  status?: string | null;
  updated_at?: string | null;
}

/**
 * Partitions issues into open and finished.
 *
 * `open` keeps the incoming order — the tasks query already sorts by
 * `position, created_at`, and re-sorting on a field the user can edit inline
 * would yank the row (and the focused title input) out from under them.
 * `done` is newest-first by `updated_at`; the tasks table has no `completed_at`.
 */
export function splitIssuesByCompletion<T extends SortableIssue>(issues: T[]): { open: T[]; done: T[] } {
  const open: T[] = [];
  const done: T[] = [];
  for (const issue of issues) {
    (isTerminalStatus(issue.status) ? done : open).push(issue);
  }
  done.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  return { open, done };
}
