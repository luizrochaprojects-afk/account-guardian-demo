/**
 * The edge functions the Agent inbox calls, ported to run against the store.
 *
 * approve / reject are the production logic nearly line for line: load the
 * pending suggestion, check it belongs to the caller's org and is still
 * pending, materialise the record (task, note, activity, or the incumbent
 * fields on the account), stamp the suggestion, and write the audit trail —
 * a human row for the decision, an agent row for the record it created.
 *
 * What is NOT here is the other half of the agent: pulling transcripts and
 * asking a model to extract suggestions. The demo ships those suggestions
 * pre-extracted in the seed, and "retry" only records that it was asked.
 */
import type { Row, Store } from './store';
import { callerProfile } from './rpc/auth';

type Edits = Record<string, unknown> | null | undefined;

function audit(store: Store, row: Row) {
  store.insert('agent_audit_log', [
    {
      organization_id: row.organization_id,
      actor_type: row.actor_type,
      actor_id: row.actor_id ?? null,
      actor_role: row.actor_type === 'human' ? 'founder' : null,
      was_founder_action: row.actor_type === 'human',
      action: row.action,
      payload: row.payload ?? {},
      meeting_ingest_id: row.meeting_ingest_id ?? null,
      suggestion_id: row.suggestion_id ?? null,
      account_id: row.account_id ?? null,
    },
  ]);
}

/** Strip undefined / empty-string keys so they don't count as edits. */
function normaliseEdits(edits: Edits): Record<string, unknown> | null {
  if (!edits) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(edits)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

function mergePayload(type: string, stored: Row, edits: Record<string, unknown> | null): Row {
  const base = { ...stored };
  if (!edits) return base;
  const take = (keys: string[]) => {
    for (const k of keys) if (edits[k] !== undefined) base[k] = edits[k];
  };
  if (type === 'incumbent_capture') take(['incumbent_vendor', 'incumbent_evidence', 'incumbent_last_renewal', 'incumbent_cycle']);
  else {
    take(['title']);
    if (type === 'task') take(['description', 'due_date', 'assignee_user_id']);
    else take(['content_markdown']);
  }
  return base;
}

function diffFields(before: Row, after: Row, accountChanged: boolean): string[] {
  const fields = new Set<string>();
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) fields.add(k);
  }
  if (accountChanged) fields.add('account_id');
  return [...fields];
}

function approve(store: Store, body: { suggestion_id: string; edits?: Edits }): Row {
  const caller = callerProfile(store);
  const orgId = caller.organization_id;
  const sug = store.table('agent_suggestions').find((s) => s.id === body.suggestion_id);
  if (!sug) return { ok: false, status: 'not_found', suggestion_id: body.suggestion_id };
  if (sug.organization_id !== orgId) return { ok: false, status: 'rejected_wrong_org', suggestion_id: sug.id };
  if (sug.status !== 'pending') return { ok: true, status: 'skipped_already_finalised', suggestion_id: sug.id };

  const edits = normaliseEdits(body.edits);
  const accountId = (edits?.account_id as string | undefined) ?? sug.account_id ?? null;
  if (!accountId) return { ok: false, status: 'rejected_account_missing', suggestion_id: sug.id };

  const merged = mergePayload(sug.type, sug.payload ?? {}, edits);
  const editedFields = diffFields(sug.payload ?? {}, merged, edits?.account_id !== undefined && edits.account_id !== sug.account_id);
  if (sug.type === 'incumbent_capture' ? !merged.incumbent_vendor || !merged.incumbent_evidence : !merged.title) {
    return { ok: false, status: 'rejected_invalid_payload', suggestion_id: sug.id };
  }

  let resultingId: string;
  let table: string;
  if (sug.type === 'task') {
    table = 'tasks';
    [{ id: resultingId }] = store.insert('tasks', [
      {
        organization_id: orgId,
        account_id: accountId,
        milestone_id: null,
        name: merged.title,
        status: 'todo',
        objective: merged.description ?? null,
        due_date: merged.due_date ?? null,
        assign_to: merged.assignee_user_id ?? null,
        created_by_agent: true,
        source_suggestion_id: sug.id,
      },
    ]);
  } else if (sug.type === 'activity') {
    table = 'activities';
    const existing = store
      .table('activities')
      .find((a) => a.organization_id === orgId && a.source === 'calendar' && a.external_id === merged.external_id);
    resultingId =
      existing?.id ??
      store.insert('activities', [
        {
          organization_id: orgId,
          account_id: accountId,
          channel: merged.channel ?? 'meeting',
          activity_type: merged.activity_type ?? 'meeting_held',
          direction: 'inbound',
          outcome: null,
          occurred_at: merged.occurred_at,
          source: 'calendar',
          external_id: merged.external_id,
          notes: merged.title,
        },
      ])[0].id;
  } else if (sug.type === 'incumbent_capture') {
    table = 'accounts';
    store.update('accounts', (a) => a.id === accountId && a.organization_id === orgId, {
      incumbent_vendor: merged.incumbent_vendor,
      incumbent_evidence: merged.incumbent_evidence,
      incumbent_last_renewal: merged.incumbent_last_renewal ?? null,
      incumbent_cycle: merged.incumbent_cycle ?? 'unknown',
      incumbent_source: 'agent',
      incumbent_captured_at: new Date().toISOString(),
    });
    resultingId = accountId;
  } else {
    table = 'notes';
    [{ id: resultingId }] = store.insert('notes', [
      {
        organization_id: orgId,
        account_id: accountId,
        title: merged.title,
        content: { markdown: merged.content_markdown ?? '' },
        body: merged.content_markdown ?? '',
        user_id: caller.user_id,
        created_by_agent: true,
        source_suggestion_id: sug.id,
      },
    ]);
  }

  const isEdited = editedFields.length > 0;
  store.update('agent_suggestions', (s) => s.id === sug.id, {
    status: isEdited ? 'edited_approved' : 'approved',
    approved_by: caller.user_id,
    approved_at: new Date().toISOString(),
    resulting_record_id: resultingId,
    account_id: accountId,
  });

  const common = { organization_id: orgId, suggestion_id: sug.id, account_id: accountId };
  if (isEdited) {
    audit(store, {
      ...common,
      actor_type: 'human',
      actor_id: caller.user_id,
      action: 'edited',
      payload: { before: sug.payload, after: merged, edited_fields: editedFields },
    });
  }
  audit(store, {
    ...common,
    actor_type: 'human',
    actor_id: caller.user_id,
    action: 'approved',
    meeting_ingest_id: sug.meeting_ingest_id,
    payload: { type: sug.type, resulting_record_id: resultingId, had_edits: isEdited },
  });
  audit(store, {
    ...common,
    actor_type: 'agent',
    action: 'created_record',
    meeting_ingest_id: sug.meeting_ingest_id,
    payload: { table, record_id: resultingId, approved_by: caller.user_id },
  });

  return {
    ok: true,
    status: isEdited ? 'edited_approved' : 'approved',
    suggestion_id: sug.id,
    resulting_record_id: resultingId,
    resulting_record_type: sug.type,
    account_id: accountId,
    edited_fields: editedFields,
  };
}

function reject(store: Store, body: { suggestion_id: string; reject_reason?: string | null }): Row {
  const caller = callerProfile(store);
  const sug = store.table('agent_suggestions').find((s) => s.id === body.suggestion_id);
  if (!sug) return { ok: false, status: 'not_found', suggestion_id: body.suggestion_id };
  if (sug.organization_id !== caller.organization_id) return { ok: false, status: 'rejected_wrong_org', suggestion_id: sug.id };
  if (sug.status !== 'pending') return { ok: true, status: 'skipped_already_finalised', suggestion_id: sug.id };

  const reason = String(body.reject_reason ?? '').slice(0, 500) || null;
  store.update('agent_suggestions', (s) => s.id === sug.id, {
    status: 'rejected',
    rejected_by: caller.user_id,
    rejected_at: new Date().toISOString(),
    reject_reason: reason,
  });
  audit(store, {
    organization_id: sug.organization_id,
    actor_type: 'human',
    actor_id: caller.user_id,
    action: 'rejected',
    suggestion_id: sug.id,
    account_id: sug.account_id,
    meeting_ingest_id: sug.meeting_ingest_id,
    payload: { type: sug.type, reason },
  });
  return { ok: true, status: 'rejected', suggestion_id: sug.id };
}

/**
 * In production this re-queues a failed transcript for extraction. The demo has
 * no model to call, so it records the request and marks the meeting as skipped
 * with a message saying why — honest rather than pretending to process.
 */
function retryIngest(store: Store, body: { meeting_ingest_id: string }): Row {
  const caller = callerProfile(store);
  const ingest = store.table('meeting_ingests').find((m) => m.id === body.meeting_ingest_id);
  if (!ingest) return { error: 'meeting_ingest_not_found' };
  store.update('meeting_ingests', (m) => m.id === ingest.id, {
    status: 'skipped',
    extraction_error: 'Portfolio demo: extraction is simulated, no model is called.',
  });
  audit(store, {
    organization_id: ingest.organization_id,
    actor_type: 'human',
    actor_id: caller.user_id,
    action: 'extraction_retry_scheduled',
    meeting_ingest_id: ingest.id,
    payload: { demo: true },
  });
  return { ok: true, status: 'queued' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FUNCTION_HANDLERS: Record<string, (store: Store, body: any) => unknown> = {
  'agent-approve-suggestion': approve,
  'agent-reject-suggestion': reject,
  'agent-retry-ingest': retryIngest,
};
