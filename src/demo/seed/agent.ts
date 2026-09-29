/**
 * The meeting agent's side of the seed: five fictional meetings, what the
 * agent proposed from each, and the audit trail of what happened next.
 *
 * In production a job pulls meeting notes, a model extracts suggestions and
 * the inbox shows them for a human to approve, edit or reject. The demo ships
 * the extraction pre-done — nothing here calls a model — so the inbox, the
 * approval flow and the audit trail can all be exercised for real.
 *
 * Mix: 7 pending (one older than the 14-day stale cut-off, one whose account
 * the agent could not resolve), 2 approved, 1 rejected.
 */
import type { Row } from '../store';
import { ORG_ID, USERS } from './org';
import { sid, type Clock } from './util';

interface MeetingSpec {
  key: string;
  account: string | null;
  title: string;
  daysAgo: number;
  tokens: number;
  summary: string;
  suggestions: SuggestionSpec[];
}

interface SuggestionSpec {
  key: string;
  type: 'task' | 'note' | 'activity' | 'incumbent_capture';
  confidence: number;
  payload: Row;
  excerpt: string;
  status?: 'pending' | 'approved' | 'rejected';
  rejectReason?: string;
  suggestedAccountName?: string;
}

const MEETINGS: MeetingSpec[] = [
  {
    key: 'meridian-followup', account: 'meridian', title: 'Meridian Health · follow-up with IT and operations', daysAgo: 2, tokens: 18_400,
    summary: 'IT needs a data-residency summary before a pilot. Ops confirmed the Monday list is the main pain. CFO not yet involved.',
    suggestions: [
      {
        key: 'residency', type: 'task', confidence: 0.91,
        payload: { title: 'Send data-residency summary to Leila (IT)', description: 'Where data is stored, retention, and sub-processors. She needs it before the pilot review.', due_date: 'IN_4_DAYS' },
        excerpt: '"If you can send me where the data lives and for how long, I can get this in front of our review board next week."',
      },
      {
        key: 'recap', type: 'note', confidence: 0.84,
        payload: { title: 'Follow-up call — IT and operations', content_markdown: '- IT (Leila) needs data residency and retention details before any pilot.\n- Ops (Hannah) confirmed the Monday list rebuild takes ~4 hours across the team.\n- CFO (Marcus) not involved yet; Hannah will bring him to the next call.' },
        excerpt: '"It is honestly half of Monday for three people."',
      },
      {
        key: 'meeting', type: 'activity', confidence: 0.97,
        payload: { title: 'Meeting held: follow-up with IT and operations', external_id: 'demo-cal-meridian-followup', occurred_at: 'MEETING_TIME', activity_type: 'meeting_held', channel: 'meeting', attendees: ['Hannah Brooks', 'Leila Haddad'] },
        excerpt: 'Calendar event: 45 min, 3 attendees.',
      },
    ],
  },
  {
    key: 'larkspur-signing', account: 'larkspur', title: 'Larkspur Financial · signing prep', daysAgo: 4, tokens: 14_100,
    summary: 'COO approved. The controller wants the order form and the security summary before signing.',
    suggestions: [
      {
        key: 'order-form', type: 'task', confidence: 0.88,
        payload: { title: 'Send order form and security summary to Wei (Controller)', due_date: 'IN_1_DAYS' },
        excerpt: '"Once Wei has the order form and the security one-pager, she can sign the same day."',
      },
      {
        key: 'prep-notes', type: 'note', confidence: 0.79,
        payload: { title: 'Signing prep — who signs and what they need', content_markdown: 'Irene (COO) approved. Wei (Controller) signs; needs order form + security summary. Target: signed before the board review.' },
        excerpt: '"Irene is on board, it is really just the paperwork now."',
        status: 'approved',
      },
    ],
  },
  {
    key: 'quarry-usage', account: 'quarry', title: 'Quarry Freight · usage review', daysAgo: 6, tokens: 16_200,
    summary: 'Two claims teams paused their workflows after the seasonal dip. Core team still active. Open to consolidating.',
    suggestions: [
      {
        key: 'consolidate', type: 'task', confidence: 0.83,
        payload: { title: 'Draft a plan to fold the paused workflows into the core team', description: 'Henrik is open to one queue for all claims if routing still works by region.', due_date: 'IN_3_DAYS' },
        excerpt: '"If one team can run it for everyone, I would rather do that than switch it off."',
      },
      {
        key: 'dup-note', type: 'note', confidence: 0.64,
        payload: { title: 'Usage review notes', content_markdown: 'Two teams paused. Core team active.' },
        excerpt: '"Two of the claims teams stopped using it after August."',
        status: 'rejected', rejectReason: 'Duplicate of the usage-drop note already on the account.',
      },
    ],
  },
  {
    key: 'halden-debrief', account: 'halden', title: 'Halden Robotics · plant visit debrief', daysAgo: 18, tokens: 21_300,
    summary: 'Service leads want one queue across plants. SSO is a hard requirement. Legacy ticketing renews in the spring.',
    suggestions: [
      {
        key: 'sso', type: 'task', confidence: 0.77,
        payload: { title: 'Ask product for a committed SSO date', due_date: 'IN_5_DAYS' },
        excerpt: '"Without SSO our IT will not even start the review."',
      },
      {
        key: 'incumbent', type: 'incumbent_capture', confidence: 0.9,
        payload: { incumbent_vendor: 'Legacy on-prem ticketing', incumbent_evidence: 'Mentioned the renewal date on the discovery call.', incumbent_cycle: 'annual' },
        excerpt: '"Our current contract renews in the spring and nobody wants to renew it."',
        status: 'approved',
      },
    ],
  },
  {
    key: 'tidewater-intro', account: null, title: 'Intro call — Tidewater', daysAgo: 1, tokens: 9_100,
    summary: 'Short intro with the CX team. Interested in automating order-status follow-ups. Asked for a case study.',
    suggestions: [
      {
        key: 'case-study', type: 'task', confidence: 0.72,
        payload: { title: 'Send a case study on order-status follow-ups', due_date: 'IN_2_DAYS' },
        excerpt: '"Do you have an example from someone in food distribution?"',
        suggestedAccountName: 'Tidewater Foods Co.',
      },
    ],
  },
];

export function agentTables(clock: Clock): Record<string, Row[]> {
  const ingests: Row[] = [];
  const suggestions: Row[] = [];
  const audit: Row[] = [];
  const notes: Row[] = [];
  let auditN = 0;
  const log = (row: Row, at: string) =>
    audit.push({
      id: sid('audit', String(auditN++)),
      organization_id: ORG_ID,
      actor_type: row.actor_type,
      actor_id: row.actor_id ?? null,
      actor_role: row.actor_type === 'human' ? 'founder' : null,
      was_founder_action: row.actor_type === 'human',
      action: row.action,
      payload: row.payload ?? {},
      meeting_ingest_id: row.meeting_ingest_id ?? null,
      suggestion_id: row.suggestion_id ?? null,
      account_id: row.account_id ?? null,
      created_at: at,
    });

  for (const m of MEETINGS) {
    const ingestId = sid('ingest', m.key);
    const accountId = m.account ? sid('account', m.account) : null;
    const held = clock.at(m.daysAgo, 15);
    const extracted = clock.at(m.daysAgo, 16, 10);
    ingests.push({
      id: ingestId,
      organization_id: ORG_ID,
      source_doc_id: `demo-doc-${m.key}`,
      folder_id: 'demo-folder',
      folder_name: 'Customer calls',
      title: m.title,
      meeting_date: held,
      participants: [],
      status: 'extracted',
      extraction_error: null,
      extraction_attempts: 1,
      next_retry_at: null,
      tokens_used: m.tokens,
      prompt_version: 'demo',
      summary_text: m.summary,
      transcript_text: null,
      raw_payload: null,
      produces_discovery_note_id: null,
      produces_qualification_update_id: null,
      created_at: clock.at(m.daysAgo, 16),
      updated_at: extracted,
    });
    log({ actor_type: 'system', action: 'ingested', meeting_ingest_id: ingestId, account_id: accountId, payload: { title: m.title } }, clock.at(m.daysAgo, 16));
    log({ actor_type: 'agent', action: accountId ? 'matched' : 'no_match', meeting_ingest_id: ingestId, account_id: accountId, payload: {} }, clock.at(m.daysAgo, 16, 5));
    log({ actor_type: 'agent', action: 'extracted', meeting_ingest_id: ingestId, account_id: accountId, payload: { suggestions: m.suggestions.length, tokens_used: m.tokens } }, extracted);

    for (const s of m.suggestions) {
      const id = sid('suggestion', m.key, s.key);
      const payload = { ...s.payload };
      for (const [k, v] of Object.entries(payload)) {
        const due = typeof v === 'string' && v.match(/^IN_(\d+)_DAYS$/);
        if (due) payload[k] = clock.day(-(Number(due[1]) - m.daysAgo));
        if (v === 'MEETING_TIME') payload[k] = held;
      }
      const status = s.status ?? 'pending';
      const decided = clock.at(Math.max(0, m.daysAgo - 1), 10);
      let resulting: string | null = null;
      if (status === 'approved') {
        if (s.type === 'note') {
          resulting = sid('note', 'agent', m.key, s.key);
          notes.push({
            id: resulting,
            organization_id: ORG_ID,
            account_id: accountId,
            user_id: USERS.alex.id,
            author: null,
            title: payload.title,
            body: payload.content_markdown,
            content: { markdown: payload.content_markdown },
            category: 'general',
            tags: [],
            participants: [],
            contact_id: null,
            project_id: null,
            task_id: null,
            created_by_agent: true,
            source_suggestion_id: id,
            created_at: decided,
            updated_at: decided,
          });
        } else if (s.type === 'incumbent_capture') {
          resulting = accountId;
        }
      }
      suggestions.push({
        id,
        organization_id: ORG_ID,
        meeting_ingest_id: ingestId,
        source: 'meeting_notes',
        account_id: accountId,
        suggested_account_name: s.suggestedAccountName ?? null,
        confidence_score: s.confidence,
        type: s.type,
        payload,
        source_excerpts: [{ text: s.excerpt, location: m.title }],
        status,
        approved_by: status === 'approved' ? USERS.alex.id : null,
        approved_at: status === 'approved' ? decided : null,
        rejected_by: status === 'rejected' ? USERS.alex.id : null,
        rejected_at: status === 'rejected' ? decided : null,
        reject_reason: s.rejectReason ?? null,
        resulting_record_id: resulting,
        expires_at: null,
        created_at: extracted,
        updated_at: status === 'pending' ? extracted : decided,
      });
      log({ actor_type: 'agent', action: 'suggested', meeting_ingest_id: ingestId, suggestion_id: id, account_id: accountId, payload: { type: s.type, confidence: s.confidence } }, extracted);
      if (status === 'approved') {
        log({ actor_type: 'human', actor_id: USERS.alex.id, action: 'approved', meeting_ingest_id: ingestId, suggestion_id: id, account_id: accountId, payload: { type: s.type, resulting_record_id: resulting, had_edits: false } }, decided);
        log({ actor_type: 'agent', action: 'created_record', meeting_ingest_id: ingestId, suggestion_id: id, account_id: accountId, payload: { table: s.type === 'note' ? 'notes' : 'accounts', record_id: resulting, approved_by: USERS.alex.id } }, decided);
      }
      if (status === 'rejected') {
        log({ actor_type: 'human', actor_id: USERS.alex.id, action: 'rejected', meeting_ingest_id: ingestId, suggestion_id: id, account_id: accountId, payload: { type: s.type, reason: s.rejectReason } }, decided);
      }
    }
  }

  return {
    meeting_ingests: ingests,
    agent_suggestions: suggestions,
    agent_audit_log: audit,
    agent_notes: notes,
    agent_settings: [
      {
        organization_id: ORG_ID,
        enabled: true,
        confidence_threshold: 0.6,
        llm_model: 'claude-sonnet-4-6',
        monthly_cost_cap_usd: 25,
        cost_capped_at: null,
        folder_ids: ['demo-folder'],
        last_poll_at: clock.at(0, Math.max(0, new Date(clock.now).getHours() - 1)),
        created_at: clock.at(120),
        updated_at: clock.at(30),
      },
    ],
  };
}
