/**
 * Column defaults, per table — the demo's equivalent of the `DEFAULT` clauses
 * in supabase/schema.sql. `id`, `created_at` and (where present) `updated_at`
 * are filled by the store itself.
 *
 * Only the tables the app writes to need an entry; a function value is called
 * per row so every insert gets a fresh array or date.
 */
export const TABLE_DEFAULTS: Record<string, Record<string, unknown>> = {
  accounts: {
    arr: 0,
    mrr: 0,
    channels: () => [],
    tags: () => [],
    trend: 'flat',
    health_score: 0,
    close_date_slips: 0,
    qualification_checklist: () => ({}),
    incumbent_cycle: 'unknown',
    pipeline_stage: 'target',
    pipeline_phase: 'sdr',
    updated_at: null,
  },
  account_stage_history: { metadata: () => ({}), source: 'system' },
  activities: { direction: 'outbound', source: 'manual', meaningful_engagement: false, updated_at: null },
  agent_audit_log: { payload: () => ({}), was_founder_action: false },
  agent_suggestions: { status: 'pending', source: 'meeting_notes', source_excerpts: () => [], payload: () => ({}), updated_at: null },
  contacts: {
    contact_type: 'stakeholder',
    deal_engagement: 'identified',
    engagement_level: 'active',
    role_in_deal: 'none',
    updated_at: null,
  },
  custom_properties: { is_required: false, is_system: false, options: () => [], position: 0, show_in_create: false, updated_at: null },
  custom_property_values: { updated_at: null },
  custom_views: { filters: () => ({}), is_favorite: false, position: 0, updated_at: null },
  customer_requests: { body: '', focus: () => [], is_important: false, updated_at: null },
  discovery_notes: {
    founder_present: false,
    generated_by: 'human',
    objections: () => [],
    prospect_language: () => [],
    source_transcript_excerpt: () => [],
    updated_at: null,
  },
  event_contacts: {},
  events: { direction: 'outbound', type: 'meeting' },
  health_metric_profiles: { is_default: false, position: 0, updated_at: null },
  health_metrics: { boolean_healthy_value: true, position: 0, weight: 1, source: 'manual', updated_at: null },
  health_profile_stages: {},
  health_score_logs: { scores: () => ({}), logged_at: () => new Date().toISOString() },
  issue_templates: { is_default: false, position: 0, updated_at: null },
  milestones: { color: '#2563EB', position: 0 },
  notes: {
    body: '',
    category: 'general',
    content: () => ({}),
    created_by_agent: false,
    participants: () => [],
    tags: () => [],
    title: 'Untitled',
    updated_at: null,
  },
  projects: { status: 'on_track', code: '', code_number: 0, updated_at: null },
  sla_rules: { is_removal: false, position: 0, priority_filter: () => [], updated_at: null },
  task_documents: { content: '', updated_at: null },
  task_relations: {},
  tasks: {
    status: 'todo',
    is_done: false,
    position: 0,
    created_by_agent: false,
    success_criteria: () => [],
    tags: () => [],
    updated_at: null,
  },
};
