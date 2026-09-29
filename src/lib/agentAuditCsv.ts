// Pure CSV row builder for agent_audit_log exports. Lives in `lib/` so it
// can be unit-tested without React. The downloader is in `csvExport.ts`.

import type { AgentAuditLog } from '@/types/agent';
import { buildCsv } from './csvExport';

export const AUDIT_CSV_COLUMNS = [
  'created_at',
  'actor_type',
  'actor_id',
  'action',
  'meeting_ingest_id',
  'suggestion_id',
  'account_id',
  'payload',
] as const;

export function buildAuditCsv(rows: AgentAuditLog[]): string {
  // buildCsv calls escapeCell which JSON-stringifies objects, so payload
  // ends up as a single quoted JSON cell. Good enough for downstream
  // spreadsheets and grep; users who need flat columns can paste into
  // a JSON-aware tool.
  return buildCsv(rows as unknown as Array<Record<string, unknown>>, [...AUDIT_CSV_COLUMNS]);
}

export function auditCsvFilename(now = new Date()): string {
  const iso = now.toISOString().replace(/[:.]/g, '-').replace(/T/, '_').slice(0, 19);
  return `agent-audit-${iso}.csv`;
}
