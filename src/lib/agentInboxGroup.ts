import type { SuggestionWithContext } from '@/types/agent';

export interface MeetingGroup {
  meetingId: string;
  title: string | null;
  folderName: string | null;
  meetingDate: string | null;
  suggestions: SuggestionWithContext[];
}

// Group suggestions by their parent meeting_ingest_id and order groups by
// most recent meeting (falling back to the first suggestion's created_at
// when meeting_date is absent on the embed). Stable within a group: the
// input order from the query (created_at desc) is preserved.
export function groupByMeeting(rows: SuggestionWithContext[]): MeetingGroup[] {
  const map = new Map<string, MeetingGroup>();
  for (const r of rows) {
    // Calendar-sourced suggestions have no meeting_ingest; collect them under a
    // single labeled "Google Calendar" group instead of a null-keyed bucket.
    const isCalendar = r.source === 'google_calendar';
    const id = isCalendar ? 'calendar' : (r.meeting_ingest_id ?? 'unknown');
    let g = map.get(id);
    if (!g) {
      g = {
        meetingId: id,
        title: isCalendar ? 'Google Calendar' : (r.meeting?.title ?? null),
        folderName: isCalendar ? null : (r.meeting?.folder_name ?? null),
        meetingDate: isCalendar ? null : (r.meeting?.meeting_date ?? null),
        suggestions: [],
      };
      map.set(id, g);
    }
    g.suggestions.push(r);
  }
  return Array.from(map.values()).sort((a, b) => {
    const ad = a.meetingDate ?? a.suggestions[0]?.created_at ?? '';
    const bd = b.meetingDate ?? b.suggestions[0]?.created_at ?? '';
    return bd.localeCompare(ad);
  });
}
