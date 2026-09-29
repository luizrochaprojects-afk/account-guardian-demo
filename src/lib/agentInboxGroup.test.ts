import { describe, it, expect } from 'vitest';
import { groupByMeeting } from './agentInboxGroup';
import type { SuggestionWithContext } from '@/types/agent';

// Minimal factory — every field the grouping cares about, optional fields
// defaulted to satisfy the type without scaffolding noise per test.
function makeSug(overrides: Partial<SuggestionWithContext> & {
  meeting_ingest_id: string;
  created_at: string;
}): SuggestionWithContext {
  return {
    id: Math.random().toString(36).slice(2, 8),
    organization_id: 'org-1',
    account_id: null,
    suggested_account_name: null,
    confidence_score: null,
    type: 'task',
    payload: { title: 't' },
    source_excerpts: [],
    source: 'meeting_notes',
    status: 'pending',
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    reject_reason: null,
    resulting_record_id: null,
    updated_at: overrides.created_at,
    meeting: null,
    account_name: null,
    ...overrides,
  };
}

describe('groupByMeeting', () => {
  it('returns an empty list when there are no rows', () => {
    expect(groupByMeeting([])).toEqual([]);
  });

  it('groups suggestions by meeting_ingest_id and preserves input order within a group', () => {
    const rows = [
      makeSug({ meeting_ingest_id: 'm-1', created_at: '2026-05-11T12:00:00Z', id: 'a' }),
      makeSug({ meeting_ingest_id: 'm-1', created_at: '2026-05-11T11:00:00Z', id: 'b' }),
      makeSug({ meeting_ingest_id: 'm-2', created_at: '2026-05-11T13:00:00Z', id: 'c' }),
    ];
    const groups = groupByMeeting(rows);
    expect(groups).toHaveLength(2);
    const m1 = groups.find((g) => g.meetingId === 'm-1')!;
    expect(m1.suggestions.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('orders groups by meeting_date desc, falling back to the first suggestions created_at', () => {
    const rows = [
      makeSug({
        meeting_ingest_id: 'older',
        created_at: '2026-05-10T10:00:00Z',
        meeting: { id: 'older', title: 'Old sync', folder_name: 'Customer Calls', meeting_date: '2026-05-10T10:00:00Z' },
      }),
      makeSug({
        meeting_ingest_id: 'newer',
        created_at: '2026-05-11T10:00:00Z',
        meeting: { id: 'newer', title: 'New sync', folder_name: 'Customer Calls', meeting_date: '2026-05-11T10:00:00Z' },
      }),
      // No meeting embed — should fall back to created_at.
      makeSug({ meeting_ingest_id: 'no-meeting', created_at: '2026-05-12T10:00:00Z' }),
    ];
    const groups = groupByMeeting(rows);
    expect(groups.map((g) => g.meetingId)).toEqual(['no-meeting', 'newer', 'older']);
  });

  it('hoists meeting metadata from the first row that carries it', () => {
    const rows = [
      makeSug({ meeting_ingest_id: 'm-1', created_at: '2026-05-11T12:00:00Z',
        meeting: { id: 'm-1', title: 'Renewal call', folder_name: 'Customer Calls', meeting_date: '2026-05-11T10:00:00Z' } }),
      makeSug({ meeting_ingest_id: 'm-1', created_at: '2026-05-11T11:00:00Z' }),
    ];
    const [group] = groupByMeeting(rows);
    expect(group.title).toBe('Renewal call');
    expect(group.folderName).toBe('Customer Calls');
    expect(group.meetingDate).toBe('2026-05-11T10:00:00Z');
  });
});
