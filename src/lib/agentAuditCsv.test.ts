import { describe, it, expect } from 'vitest';
import { AUDIT_CSV_COLUMNS, auditCsvFilename, buildAuditCsv } from './agentAuditCsv';
import type { AgentAuditLog } from '@/types/agent';

function row(overrides: Partial<AgentAuditLog> = {}): AgentAuditLog {
  return {
    id: 'a1',
    organization_id: 'org-1',
    actor_type: 'human',
    actor_id: 'u1',
    action: 'approved',
    payload: { title: 'Send proposal' },
    meeting_ingest_id: 'm1',
    suggestion_id: 's1',
    account_id: 'acc-1',
    created_at: '2026-05-12T10:30:00.000Z',
    ...overrides,
  };
}

describe('buildAuditCsv', () => {
  it('emits header in the canonical column order', () => {
    const csv = buildAuditCsv([]);
    expect(csv).toBe(AUDIT_CSV_COLUMNS.join(','));
  });

  it('serializes payload as a JSON-encoded cell with quoting/escaping', () => {
    const csv = buildAuditCsv([row({ payload: { title: 'A "tricky", title' } })]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    // RFC 4180: cells with commas/quotes/newlines are wrapped in double
    // quotes; embedded quotes are doubled. JSON has both, so we expect the
    // payload to appear with the outer wrapper and escaped inner quotes.
    expect(lines[1]).toContain('"{""title"":""A \\""tricky\\"", title""}"');
  });

  it('renders nullable fields as empty cells', () => {
    const csv = buildAuditCsv([
      row({ actor_id: null, suggestion_id: null, account_id: null, meeting_ingest_id: null }),
    ]);
    const lines = csv.split('\r\n');
    const fields = lines[1].split(',');
    // header order: created_at, actor_type, actor_id, action, meeting_ingest_id, suggestion_id, account_id, payload
    expect(fields[2]).toBe(''); // actor_id
    expect(fields[4]).toBe(''); // meeting_ingest_id
    expect(fields[5]).toBe(''); // suggestion_id
    expect(fields[6]).toBe(''); // account_id
  });

  it('produces one CSV line per row', () => {
    const csv = buildAuditCsv([row({ id: 'a1' }), row({ id: 'a2' }), row({ id: 'a3' })]);
    expect(csv.split('\r\n')).toHaveLength(4); // header + 3 rows
  });
});

describe('auditCsvFilename', () => {
  it('produces a deterministic timestamped name', () => {
    const fixed = new Date('2026-05-12T10:30:00.000Z');
    expect(auditCsvFilename(fixed)).toBe('agent-audit-2026-05-12_10-30-00.csv');
  });
});
