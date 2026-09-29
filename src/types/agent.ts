// Local TypeScript shapes for the meeting-agent tables (see the agent section
// of supabase/schema.sql). Narrower than the generated row types: payloads are
// typed per suggestion type, and statuses are unions.

export type SuggestionType = 'task' | 'note' | 'activity' | 'incumbent_capture';

export type SuggestionStatus =
  | 'pending'
  | 'approved'
  | 'edited_approved'
  | 'rejected';

export type IngestStatus =
  | 'pending_extraction'
  | 'extracting'
  | 'extracted'
  | 'extraction_failed'
  | 'skipped';

export type ActorType = 'agent' | 'human' | 'system';

export interface TaskSuggestionPayload {
  title: string;
  description?: string;
  due_date?: string;
  assignee_user_id?: string;
}

export interface NoteSuggestionPayload {
  title: string;
  content_markdown: string;
}

// Calendar-sourced activity suggestion (see calendar-poll).
export interface ActivitySuggestionPayload {
  title: string;
  external_id: string;
  occurred_at: string;
  activity_type: 'meeting_held' | 'meeting_booked';
  channel: 'meeting';
  attendees?: string[];
}

// Incumbent capture.
// Approval writes straight to accounts.incumbent_* — no tasks/notes row, no title.
export interface IncumbentCaptureSuggestionPayload {
  incumbent_vendor: string;
  incumbent_evidence: string;
  incumbent_last_renewal?: string;
  incumbent_cycle?: 'annual' | 'biennial' | 'monthly' | 'unknown';
}

export type SuggestionPayload =
  | TaskSuggestionPayload
  | NoteSuggestionPayload
  | ActivitySuggestionPayload
  | IncumbentCaptureSuggestionPayload;

export interface SourceExcerpt {
  text: string;
  location?: string;
}

export interface AgentSuggestion {
  id: string;
  organization_id: string;
  meeting_ingest_id: string | null;   // null for non-meeting sources (calendar)
  source: string;                     // 'meeting_notes' | 'calendar'
  account_id: string | null;
  suggested_account_name: string | null;
  confidence_score: number | null;
  type: SuggestionType;
  payload: SuggestionPayload;
  source_excerpts: SourceExcerpt[];
  status: SuggestionStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  resulting_record_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingIngest {
  id: string;
  organization_id: string;
  source_doc_id: string;
  folder_id: string | null;
  folder_name: string | null;
  title: string | null;
  meeting_date: string | null;
  participants: unknown;
  status: IngestStatus;
  extraction_error: string | null;
  tokens_used: number | null;
  prompt_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentSettings {
  organization_id: string;
  enabled: boolean;
  /** Meeting-notes folders the agent watches. */
  folder_ids: string[];
  confidence_threshold: number;
  llm_model: string;
  last_poll_at: string | null;
  created_at: string;
  updated_at: string;
}


export interface AgentAuditLog {
  id: string;
  organization_id: string;
  actor_type: ActorType;
  actor_id: string | null;
  action: string;
  payload: Record<string, unknown>;
  meeting_ingest_id: string | null;
  suggestion_id: string | null;
  account_id: string | null;
  created_at: string;
}

// Suggestion row decorated with the meeting + account names the inbox renders.
export interface SuggestionWithContext extends AgentSuggestion {
  meeting: Pick<MeetingIngest, 'id' | 'title' | 'folder_name' | 'meeting_date'> | null;
  account_name: string | null;
}
