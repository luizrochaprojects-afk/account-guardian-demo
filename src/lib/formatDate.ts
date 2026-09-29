import { format, formatDistanceToNowStrict, isToday, isYesterday, differenceInCalendarDays } from 'date-fns';

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Single date-formatting rule for the whole account page (and anywhere else
 * that wants it): relative for the last 7 days, absolute after that. Pair
 * with `formatDateTooltip` as a `title` attribute so the exact value is
 * always one hover away.
 */
export function formatDate(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';

  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';

  const days = Math.abs(differenceInCalendarDays(new Date(), date));
  if (days <= 7) return formatDistanceToNowStrict(date, { addSuffix: true });
  return format(date, 'MMM d, yyyy');
}

/** Full absolute date + time, for a tooltip over a relative/short label. */
export function formatDateTooltip(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  return date ? format(date, "MMM d, yyyy 'at' h:mm a") : '';
}

/** Compact relative time for activity feeds ("48m ago", "3h ago", "2d ago"), falling back to an absolute date past 7 days. */
export function formatRelativeCompact(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return format(date, 'MMM d, yyyy');
}
