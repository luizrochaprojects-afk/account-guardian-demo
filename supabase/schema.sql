-- =============================================================================
-- Account Guardian: database schema (portfolio edition)
--
-- The production backend is Postgres on Supabase. This file is the reference
-- for its data model: tables, the multi-tenant row-level security, and the
-- business rules the database enforces on its own (stage transitions, stage
-- history, timeline events, derived account fields).
--
-- The browser demo does not run this file. It runs TypeScript twins of the
-- same objects (src/demo/rpc, src/demo/triggers.ts, src/demo/views.ts,
-- src/demo/schema.ts), and src/demo/schemaParity.test.ts keeps the column
-- lists here in step with src/types/database.ts.
--
-- Apply to an empty database (Postgres 15 or later):
--   psql -v ON_ERROR_STOP=1 -f supabase/schema.sql
--
-- Written to be re-runnable: tables and constraints are created only if
-- missing, functions and views are replaced, triggers and policies are
-- recreated.
-- =============================================================================


-- =============================================================================
-- 0. LOCAL-ONLY PRELUDE
--
-- Supabase provides the `auth` schema, `auth.uid()` and the API roles
-- (anon, authenticated, service_role). On a plain Postgres none of them exist,
-- so this block creates minimal stand-ins, and ONLY when they are missing. On
-- Supabase every branch below is a no-op.
--
-- Locally, "who is calling" is simulated with a session setting:
--   SET request.jwt.claim.sub = '<user uuid>';
--   SET ROLE authenticated;
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- Server-side jobs (meeting ingestion, the nightly classifier) run as this
    -- role. BYPASSRLS mirrors Supabase.
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE
      AS $body$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $body$
    $fn$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  END IF;
END $$;

-- gen_random_uuid() is built in from Postgres 13 on; no extension needed.


-- =============================================================================
-- 1. ENUMS
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.profile_role AS ENUM ('member', 'founder');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The pipeline. Forward path: target -> ... -> steady (see pipeline_stage_rank).
-- expanding / at_risk are recurring customer states; paused, disqualified,
-- closed_lost and churned are exits.
DO $$ BEGIN
  CREATE TYPE public.pipeline_stage AS ENUM (
    'target', 'working', 'paused', 'disqualified',
    'discovery_call', 'qualified_opportunity', 'business_case', 'sign_off',
    'closed_lost', 'closed_won', 'setup', 'pilot_running', 'pilot_review',
    'adoption', 'ramping', 'steady', 'expanding', 'at_risk', 'churned'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pipeline_phase AS ENUM ('sdr', 'sales', 'onboarding', 'customer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.loss_reason_category AS ENUM (
    'no_budget', 'no_volume', 'bad_timing', 'current_stack_sufficient',
    'misunderstood_proposal', 'wrong_channel', 'integration_too_heavy',
    'no_internal_owner', 'decision_maker_disengaged', 'competitor_blocks',
    'compliance_risk', 'we_declined_no_fit'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.disqualify_reason AS ENUM (
    'no_fit', 'no_budget', 'no_volume', 'wrong_channel', 'no_response',
    'bad_timing', 'competitor_locked', 'no_internal_owner'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.churn_reason AS ENUM (
    'price', 'low_usage', 'poor_results', 'missing_features',
    'switched_competitor', 'lost_champion', 'budget_cut', 'compliance'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.founder_confidence AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.incumbent_cycle AS ENUM ('annual', 'biennial', 'monthly', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.incumbent_source AS ENUM ('human', 'agent', 'import');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.discovery_generated_by AS ENUM (
    'human', 'agent_extracted', 'agent_extracted_human_edited'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.activity_channel AS ENUM (
    'email', 'call', 'meeting', 'linkedin', 'whatsapp', 'sms', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.activity_type AS ENUM (
    'outreach', 'reply', 'meeting_booked', 'meeting_held', 'no_show',
    'demo', 'follow_up', 'note', 'task', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.activity_direction AS ENUM ('inbound', 'outbound', 'internal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.activity_outcome AS ENUM (
    'positive', 'neutral', 'negative', 'no_response', 'bounced', 'unsubscribed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.activity_source AS ENUM (
    'manual', 'meeting_notes', 'gmail', 'calendar', 'slack', 'import', 'agent', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- 2. TABLES
--
-- Tenancy: every domain table carries organization_id, and RLS (section 7)
-- scopes every row to the caller's organization. User ids (created_by,
-- user_id, *_owner_id, ...) are auth user ids.
-- =============================================================================

-- 2.1 Tenancy -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid NOT NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- One row per signed-in user. organization_id is what every RLS policy
-- resolves through (see get_user_org_id). role gates the founder-only stage
-- moves in transition_stage: RLS is for tenancy, role checks live in functions.
CREATE TABLE IF NOT EXISTS public.profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL UNIQUE,
  organization_id       uuid REFERENCES public.organizations(id),
  display_name          text,
  avatar_url            text,
  role                  public.profile_role NOT NULL DEFAULT 'member',
  onboarding_completed  boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_org_role ON public.profiles (organization_id, role);

-- 2.2 Accounts: an account IS the deal ------------------------------------------
--
-- There is no separate deals table. Pipeline position, deal size, owners,
-- close dates and the qualification checklist all live on the account row.

CREATE TABLE IF NOT EXISTS public.accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  -- Short uppercase key used in task codes (ACME-7). Filled by a trigger.
  code_prefix           text NOT NULL,
  industry              text,
  segment               text,
  region                text,
  plan                  text,
  source                text,
  tags                  text[] NOT NULL DEFAULT '{}',
  channels              text[] NOT NULL DEFAULT '{}',

  -- Deal size. mrr is the stated monthly value; arr is kept alongside it.
  mrr                   numeric NOT NULL DEFAULT 0,
  arr                   numeric NOT NULL DEFAULT 0,
  trend                 text NOT NULL DEFAULT 'flat',
  -- Mirror of the latest health_score_logs.total_score (trigger-maintained).
  health_score          integer NOT NULL DEFAULT 0,

  -- Pipeline. Only transition_stage() may change pipeline_stage (see the
  -- guard trigger). pipeline_phase is derived from the stage and stored so
  -- boards and dashboards can filter on it with an index.
  pipeline_stage        public.pipeline_stage DEFAULT 'target',
  pipeline_phase        public.pipeline_phase DEFAULT 'sdr',
  founder_confidence    public.founder_confidence,
  revenue_owner_id      uuid,
  delivery_owner_id     uuid,

  -- Qualification checklist: { "<item>": { "answer": true|false|null, ... } }.
  -- transition_stage() reads it when a deal is qualified.
  qualification_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  founder_approved_at   timestamptz,
  founder_approved_by   uuid,

  forecast_close_date   date,
  expected_close_date   date,
  close_date_slips      integer NOT NULL DEFAULT 0,

  -- Post-close milestones. first_usage_at is the real "won": a signature
  -- without real usage is not revenue.
  customer_since        date,
  golive_at             timestamptz,
  first_usage_at        timestamptz,
  first_impact_at       timestamptz,

  -- Activity markers, maintained by triggers on activities, notes, tasks and
  -- stage history.
  first_worked_at       timestamptz,
  first_engaged_at      timestamptz,
  first_meeting_at      timestamptz,
  last_activity_at      timestamptz,
  last_contact          date,

  -- The account's next step mirrors its open next_step task (trigger-maintained).
  next_step             text,
  next_step_due         date,
  next_step_task_id     uuid,

  success_promise       text,
  risk_notes            text,
  main_issue            text,

  -- Exits. The reason columns are written by transition_stage() from its
  -- metadata argument, together with the stage the deal left from.
  loss_reason_category  public.loss_reason_category,
  disqualify_reason     public.disqualify_reason,
  churn_reason          public.churn_reason,
  loss_reason_detail    text,
  lost_from_stage       public.pipeline_stage,
  revisit_at            date,

  -- Customer phase. The customer classifier writes stage + risk reason; a
  -- human move inside the phase is a "pin" and must carry a reason.
  customer_risk_reason       text,
  customer_stage_pinned_at   timestamptz,
  customer_stage_pinned_by   uuid,
  customer_stage_pin_reason  text,
  reactivated_at             timestamptz,

  -- What the prospect uses today and when it renews.
  incumbent_vendor                  text,
  incumbent_last_renewal            date,
  incumbent_cycle                   public.incumbent_cycle NOT NULL DEFAULT 'unknown',
  incumbent_evidence                text,
  incumbent_source                  public.incumbent_source,
  incumbent_captured_at             timestamptz,
  incumbent_window_snoozed_until    date,
  incumbent_window_disabled_reason  text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT accounts_code_prefix_unique UNIQUE (organization_id, code_prefix),
  CONSTRAINT accounts_trend_check CHECK (trend IN ('up', 'down', 'flat')),
  CONSTRAINT accounts_health_score_range CHECK (health_score BETWEEN 0 AND 100),
  CONSTRAINT accounts_close_date_slips_nonneg CHECK (close_date_slips >= 0),
  CONSTRAINT accounts_customer_risk_reason_check CHECK (
    customer_risk_reason IS NULL
    OR customer_risk_reason IN ('no_usage', 'poor_health', 'gone_dark', 'contracting')
  ),
  -- A lost deal without a reason teaches nothing. transition_stage() already
  -- demands one; this makes it true for every other write path too.
  CONSTRAINT chk_loss_reason_required_when_lost CHECK (
    pipeline_stage <> 'closed_lost' OR loss_reason_category IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_accounts_org ON public.accounts (organization_id);
CREATE INDEX IF NOT EXISTS idx_accounts_pipeline_stage ON public.accounts (organization_id, pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_accounts_pipeline_phase ON public.accounts (organization_id, pipeline_phase);
CREATE INDEX IF NOT EXISTS idx_accounts_revenue_owner ON public.accounts (revenue_owner_id);
CREATE INDEX IF NOT EXISTS idx_accounts_delivery_owner ON public.accounts (delivery_owner_id);
CREATE INDEX IF NOT EXISTS idx_accounts_next_step_task ON public.accounts (next_step_task_id)
  WHERE next_step_task_id IS NOT NULL;

-- 2.3 People and interactions -------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id        uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name              text NOT NULL,
  role              text,
  email             text,
  phone             text,
  department        text,
  linkedin_url      text,
  contact_type      text NOT NULL DEFAULT 'stakeholder',
  engagement_level  text NOT NULL DEFAULT 'active',
  -- Deal coverage: what this person is in the deal, and how engaged they are.
  -- transition_stage() reads both (closed_won needs an engaged decision maker
  -- and an engaged budget owner).
  role_in_deal      text NOT NULL DEFAULT 'none',
  deal_engagement   text NOT NULL DEFAULT 'identified',
  last_interaction  date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contacts_role_in_deal_check CHECK (role_in_deal IN (
    'champion', 'decision_maker', 'budget_owner', 'user', 'technical_evaluator',
    'influencer', 'procurement', 'legal', 'blocker', 'none'
  )),
  CONSTRAINT contacts_deal_engagement_check CHECK (deal_engagement IN (
    'identified', 'approached', 'engaged', 'left_company', 'not_interested'
  ))
);

CREATE INDEX IF NOT EXISTS idx_contacts_account ON public.contacts (account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_deal_coverage
  ON public.contacts (organization_id, account_id, deal_engagement);

-- The account timeline: meetings, calls, emails, and the system rows the
-- lifecycle trigger writes on every stage move (group_label = 'lifecycle').
CREATE TABLE IF NOT EXISTS public.events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id       uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL,
  title            text NOT NULL,
  type             text NOT NULL DEFAULT 'meeting',
  channel          text,
  direction        text NOT NULL DEFAULT 'outbound',
  sentiment        text,
  summary          text,
  group_label      text,
  date             date,
  time             text,
  scheduled_at     timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT events_direction_check CHECK (direction IN ('inbound', 'outbound', 'internal'))
);

CREATE INDEX IF NOT EXISTS idx_events_org ON public.events (organization_id);
CREATE INDEX IF NOT EXISTS idx_events_account ON public.events (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_scheduled_at ON public.events (scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- One interaction can involve several contacts.
CREATE TABLE IF NOT EXISTS public.event_contacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id         uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  contact_id       uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT event_contacts_unique UNIQUE (event_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_event_contacts_contact ON public.event_contacts (contact_id);

-- Structured sales activity (outreach, replies, meetings held). Feeds the
-- first-worked / first-engaged / first-meeting markers on accounts.
CREATE TABLE IF NOT EXISTS public.activities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id       uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id       uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  channel          public.activity_channel NOT NULL,
  activity_type    public.activity_type NOT NULL,
  direction        public.activity_direction NOT NULL DEFAULT 'outbound',
  outcome          public.activity_outcome,
  -- Derived, never typed: an inbound touch, a held meeting / demo / reply, or
  -- a positive outcome counts as real engagement.
  meaningful_engagement boolean GENERATED ALWAYS AS (
    direction = 'inbound'
    OR activity_type IN ('meeting_held', 'demo', 'reply')
    OR outcome = 'positive'
  ) STORED,
  owner_id         uuid,
  source           public.activity_source NOT NULL DEFAULT 'manual',
  -- Id in the system the activity was imported from; dedupes re-imports.
  external_id      text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_org_account_occurred
  ON public.activities (organization_id, account_id, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_activities_source_external
  ON public.activities (organization_id, source, external_id)
  WHERE external_id IS NOT NULL;

-- 2.4 Meeting agent -------------------------------------------------------------
--
-- Meeting notes are ingested server-side, a model extracts proposals, and a
-- human approves or rejects each one. Clients read these tables; only the
-- service role writes ingests and the audit log.

CREATE TABLE IF NOT EXISTS public.meeting_ingests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_doc_id         text NOT NULL,
  folder_id             text,
  folder_name           text,
  title                 text,
  meeting_date          timestamptz,
  participants          jsonb NOT NULL DEFAULT '[]'::jsonb,
  transcript_text       text,
  summary_text          text,
  raw_payload           jsonb,
  status                text NOT NULL DEFAULT 'pending_extraction',
  extraction_error      text,
  extraction_attempts   integer NOT NULL DEFAULT 0,
  next_retry_at         timestamptz,
  tokens_used           integer,
  prompt_version        text,
  produces_discovery_note_id        uuid,  -- FK added after discovery_notes
  produces_qualification_update_id  uuid,  -- FK added after agent_suggestions
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT meeting_ingests_source_doc_unique UNIQUE (organization_id, source_doc_id),
  CONSTRAINT meeting_ingests_status_check CHECK (status IN (
    'pending_extraction', 'extracting', 'extracted', 'extraction_failed', 'skipped'
  ))
);

CREATE INDEX IF NOT EXISTS idx_meeting_ingests_org_created
  ON public.meeting_ingests (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_suggestions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Null for suggestions that did not come from a meeting (calendar, ...).
  meeting_ingest_id       uuid REFERENCES public.meeting_ingests(id) ON DELETE CASCADE,
  source                  text NOT NULL DEFAULT 'meeting_notes',
  -- Null when the agent could not match an account; a human picks one.
  account_id              uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  suggested_account_name  text,
  confidence_score        numeric(3,2),
  type                    text NOT NULL,
  payload                 jsonb NOT NULL,
  source_excerpts         jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                  text NOT NULL DEFAULT 'pending',
  approved_by             uuid,
  approved_at             timestamptz,
  rejected_by             uuid,
  rejected_at             timestamptz,
  reject_reason           text,
  resulting_record_id     uuid,
  expires_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT agent_suggestions_confidence_range CHECK (
    confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1
  ),
  CONSTRAINT agent_suggestions_type_check CHECK (type IN (
    'task', 'note', 'activity', 'incumbent_capture',
    'discovery_note_extraction', 'qualification_checklist_update',
    'pipeline_stage_advance', 'loss_reason_categorization',
    'unknown_account_resolution'
  )),
  CONSTRAINT agent_suggestions_status_check CHECK (status IN (
    'pending', 'approved', 'edited_approved', 'rejected', 'expired'
  )),
  -- A meeting-derived suggestion must point back at the meeting it came from.
  CONSTRAINT agent_suggestions_meeting_requires_ingest CHECK (
    source <> 'meeting_notes' OR meeting_ingest_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_suggestions_org_status
  ON public.agent_suggestions (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_suggestions_account
  ON public.agent_suggestions (account_id) WHERE account_id IS NOT NULL;

-- Append-only trail of every agent and human action on the agent's output.
CREATE TABLE IF NOT EXISTS public.agent_audit_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_type          text NOT NULL,
  actor_id            uuid,
  actor_role          public.profile_role,
  was_founder_action  boolean NOT NULL DEFAULT false,
  action              text NOT NULL,
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  meeting_ingest_id   uuid REFERENCES public.meeting_ingests(id) ON DELETE SET NULL,
  suggestion_id       uuid REFERENCES public.agent_suggestions(id) ON DELETE SET NULL,
  account_id          uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT agent_audit_log_actor_type_check CHECK (actor_type IN ('agent', 'human', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_agent_audit_log_org_created
  ON public.agent_audit_log (organization_id, created_at DESC);

-- One row per organization.
CREATE TABLE IF NOT EXISTS public.agent_settings (
  organization_id       uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled               boolean NOT NULL DEFAULT false,
  -- Folders of meeting notes the agent watches: [{ "id": ..., "name": ... }].
  folder_ids            jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_threshold  numeric(3,2) NOT NULL DEFAULT 0.60,
  llm_model             text NOT NULL DEFAULT 'claude-sonnet-4-6',
  monthly_cost_cap_usd  numeric(8,2) NOT NULL DEFAULT 10.00,
  -- Set when this month's spend reached the cap; extraction pauses until reset.
  cost_capped_at        timestamptz,
  last_poll_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT agent_settings_threshold_range CHECK (confidence_threshold BETWEEN 0 AND 1),
  CONSTRAINT agent_settings_cap_nonneg CHECK (monthly_cost_cap_usd >= 0)
);

-- 2.5 Work: tasks (the UI calls them issues) and notes ------------------------

CREATE TABLE IF NOT EXISTS public.tasks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id            uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  parent_id             uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  -- Project planning (milestones, templates) is not part of this edition;
  -- the columns stay so the row shape matches the application's types.
  milestone_id          uuid,
  template_id           uuid,
  -- ACME-7: account code prefix + per-account sequence, assigned by trigger.
  code                  text,
  code_number           integer,
  name                  text NOT NULL,
  objective             text,
  -- 'next_step' marks the task the account's next step mirrors.
  category              text,
  status                text NOT NULL DEFAULT 'todo',
  priority              text,
  is_done               boolean NOT NULL DEFAULT false,
  position              integer NOT NULL DEFAULT 0,
  due_date              date,
  due_label             text,
  assign_to             text,
  assigned_role         text,
  blocked_by            text,
  blocking              text,
  success_criteria      text[] NOT NULL DEFAULT '{}',
  tags                  text[] NOT NULL DEFAULT '{}',
  sla_started_at        timestamptz,
  sla_duration_hours    integer,
  sla_deadline          timestamptz,
  -- Provenance of agent-created tasks; immutable after insert (trigger).
  created_by_agent      boolean NOT NULL DEFAULT false,
  source_suggestion_id  uuid REFERENCES public.agent_suggestions(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tasks_code_number_unique UNIQUE (account_id, code_number)
);

CREATE INDEX IF NOT EXISTS idx_tasks_org ON public.tasks (organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_account_open ON public.tasks (account_id, due_date)
  WHERE parent_id IS NULL AND status NOT IN ('done', 'cancelled');
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON public.tasks (parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.notes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id            uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  contact_id            uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  task_id               uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  project_id            uuid,  -- projects are not part of this edition
  user_id               uuid NOT NULL,
  title                 text NOT NULL DEFAULT 'Untitled',
  body                  text NOT NULL DEFAULT '',
  content               jsonb NOT NULL DEFAULT '{}'::jsonb,
  category              text NOT NULL DEFAULT 'general',
  author                text,
  participants          text[] NOT NULL DEFAULT '{}',
  tags                  text[] NOT NULL DEFAULT '{}',
  created_by_agent      boolean NOT NULL DEFAULT false,
  source_suggestion_id  uuid REFERENCES public.agent_suggestions(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_org ON public.notes (organization_id);
CREATE INDEX IF NOT EXISTS idx_notes_account ON public.notes (account_id, created_at DESC);

-- 2.6 Stage history -----------------------------------------------------------
--
-- One closed interval per stage an account occupied. Written only by the
-- sync_account_stage_history trigger, read-only to clients. Every dashboard
-- number ("how many deals reached qualified this month", conversion, time in
-- stage) is computed from here, from observed moves, never from where
-- accounts happen to sit today.

CREATE TABLE IF NOT EXISTS public.account_stage_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id       uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  from_stage       public.pipeline_stage,
  to_stage         public.pipeline_stage NOT NULL,
  from_phase       public.pipeline_phase,
  to_phase         public.pipeline_phase,
  entered_at       timestamptz NOT NULL,
  exited_at        timestamptz,
  duration_hours   numeric GENERATED ALWAYS AS (
    round((extract(epoch FROM (exited_at - entered_at)) / 3600.0)::numeric, 1)
  ) STORED,
  changed_by       uuid,
  -- Who moved it: transition_stage (a person), classifier (the nightly
  -- customer job), system, manual, or backfill_events (reconstructed from the
  -- timeline; dashboards exclude those because their dates are inferred).
  source           text NOT NULL DEFAULT 'transition_stage',
  -- Deal size at entry, so stage value is not rewritten when a deal is resized.
  arr_at_entry     numeric,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_event_id  uuid REFERENCES public.events(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT account_stage_history_source_check CHECK (source IN (
    'transition_stage', 'classifier', 'system', 'manual', 'backfill_events'
  )),
  CONSTRAINT chk_ash_interval_ordered CHECK (exited_at IS NULL OR exited_at >= entered_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ash_account_entered
  ON public.account_stage_history (account_id, entered_at);
-- At most one open interval per account: the stage it is in right now.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ash_one_open_per_account
  ON public.account_stage_history (account_id) WHERE exited_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ash_org_stage_entered
  ON public.account_stage_history (organization_id, to_stage, entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_ash_org_entered
  ON public.account_stage_history (organization_id, entered_at);

-- 2.7 Discovery ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.discovery_notes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id             uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id             uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  meeting_event_id       uuid REFERENCES public.events(id) ON DELETE SET NULL,
  meeting_ingest_id      uuid REFERENCES public.meeting_ingests(id) ON DELETE SET NULL,
  context                text,
  current_stack          text,
  current_workflow       text,
  decision_maker         text,
  primary_pain           text,
  objections             text[] NOT NULL DEFAULT '{}',
  prospect_language      text[] NOT NULL DEFAULT '{}',
  current_competitor     text,
  what_caught_attention  text,
  what_confused          text,
  next_steps             text,
  fit_thesis             text,
  risk_thesis            text,
  budget_signal          text,
  -- Provenance when a model drafted the note from a meeting.
  generated_by           public.discovery_generated_by NOT NULL DEFAULT 'human',
  agent_confidence       numeric(3,2),
  agent_model            text,
  source_transcript_excerpt jsonb NOT NULL DEFAULT '[]'::jsonb,
  founder_present        boolean NOT NULL DEFAULT false,
  created_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT discovery_notes_confidence_range CHECK (
    agent_confidence IS NULL OR agent_confidence BETWEEN 0 AND 1
  )
);

CREATE INDEX IF NOT EXISTS idx_discovery_notes_account
  ON public.discovery_notes (account_id, created_at DESC);

-- 2.8 Health scoring ----------------------------------------------------------
--
-- Each organization defines metric profiles (one per lifecycle moment), maps
-- stages to profiles, and logs graded scores per account.

CREATE TABLE IF NOT EXISTS public.health_metric_profiles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  is_default       boolean NOT NULL DEFAULT false,
  position         integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_metric_profiles_org ON public.health_metric_profiles (organization_id);

CREATE TABLE IF NOT EXISTS public.health_metrics (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id             uuid REFERENCES public.health_metric_profiles(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  icon                   text NOT NULL DEFAULT 'eye',
  source                 text NOT NULL DEFAULT 'manual',
  type                   text NOT NULL DEFAULT 'number',
  weight                 integer NOT NULL DEFAULT 1,
  -- Grade thresholds: { "operator": "<" | "<=" | ">" | ">=", "value": n }.
  poor                   jsonb NOT NULL DEFAULT '{"operator":"<","value":30}'::jsonb,
  concerning             jsonb NOT NULL DEFAULT '{"operator":"<","value":70}'::jsonb,
  healthy                jsonb NOT NULL DEFAULT '{"operator":">=","value":70}'::jsonb,
  boolean_healthy_value  boolean NOT NULL DEFAULT true,
  position               integer NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT health_metrics_type_check CHECK (type IN ('number', 'percentage', 'boolean')),
  CONSTRAINT health_metrics_weight_nonneg CHECK (weight >= 0)
);

CREATE INDEX IF NOT EXISTS idx_health_metrics_profile ON public.health_metrics (profile_id);

-- Which profile scores an account in a given stage. One profile per stage.
CREATE TABLE IF NOT EXISTS public.health_profile_stages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id       uuid NOT NULL REFERENCES public.health_metric_profiles(id) ON DELETE CASCADE,
  stage            public.pipeline_stage NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT health_profile_stages_unique UNIQUE (organization_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_health_profile_stages_profile ON public.health_profile_stages (profile_id);

-- metrics_snapshot freezes the metric definitions used for this score, so an
-- old score stays explainable after the profile is edited.
CREATE TABLE IF NOT EXISTS public.health_score_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id        uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL,
  logged_at         timestamptz NOT NULL DEFAULT now(),
  scores            jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_score       integer NOT NULL,
  metrics_snapshot  jsonb,
  profile_id        uuid REFERENCES public.health_metric_profiles(id) ON DELETE SET NULL,
  profile_name      text,
  observation       text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT health_score_logs_total_range CHECK (total_score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_health_score_logs_account
  ON public.health_score_logs (account_id, logged_at DESC);

-- 2.9 Product usage -----------------------------------------------------------
--
-- Weekly usage per customer, in whatever unit the product bills or measures.
-- Loaded by a server-side sync; the customer classifier reads it through the
-- account_customer_signals view.

CREATE TABLE IF NOT EXISTS public.usage_weekly (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id       uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  week_start       date NOT NULL,
  units            numeric NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT usage_weekly_account_week_unique UNIQUE (account_id, week_start),
  -- Weeks start on Monday, the same convention as date_trunc('week', ...).
  CONSTRAINT usage_weekly_week_is_monday CHECK (extract(isodow FROM week_start) = 1),
  CONSTRAINT usage_weekly_units_nonneg CHECK (units >= 0)
);

CREATE INDEX IF NOT EXISTS idx_usage_weekly_org_week ON public.usage_weekly (organization_id, week_start);

-- 2.10 Workspace settings -----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.org_settings (
  organization_id                     uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  currency_code                       text NOT NULL DEFAULT 'USD',
  currency_symbol                     text NOT NULL DEFAULT '$',
  -- Pipeline hygiene: days in one stage before an account is "stuck".
  hygiene_stale_days                  integer NOT NULL DEFAULT 7,
  weekly_discovery_target             integer NOT NULL DEFAULT 4,
  incumbent_lead_days                 integer NOT NULL DEFAULT 90,
  -- Customer classifier thresholds.
  customer_expansion_threshold_pct    numeric NOT NULL DEFAULT 25,
  customer_contraction_threshold_pct  numeric NOT NULL DEFAULT 25,
  customer_dormant_weeks              integer NOT NULL DEFAULT 4,
  customer_gone_dark_days             integer NOT NULL DEFAULT 21,
  customer_ramp_days                  integer NOT NULL DEFAULT 30,
  customer_coverage_alert_weeks       numeric NOT NULL DEFAULT 2,
  -- Revenue goal: month-over-month growth target from an anchor month.
  revenue_mom_goal_pct                numeric NOT NULL DEFAULT 50,
  revenue_goal_anchor_month           date NOT NULL DEFAULT date_trunc('month', now())::date,
  created_at                          timestamptz NOT NULL DEFAULT now(),
  updated_at                          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT org_settings_hygiene_stale_days_pos CHECK (hygiene_stale_days > 0)
);

-- 2.11 Foreign keys that close a cycle ------------------------------------------
--
-- Added after both sides exist. Wrapped so a re-run skips them.

DO $$ BEGIN
  ALTER TABLE public.accounts
    ADD CONSTRAINT accounts_next_step_task_id_fkey
    FOREIGN KEY (next_step_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.accounts
    ADD CONSTRAINT accounts_revenue_owner_id_fkey
    FOREIGN KEY (revenue_owner_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.accounts
    ADD CONSTRAINT accounts_delivery_owner_id_fkey
    FOREIGN KEY (delivery_owner_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.meeting_ingests
    ADD CONSTRAINT meeting_ingests_produces_discovery_note_id_fkey
    FOREIGN KEY (produces_discovery_note_id) REFERENCES public.discovery_notes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.meeting_ingests
    ADD CONSTRAINT meeting_ingests_produces_qualification_update_id_fkey
    FOREIGN KEY (produces_qualification_update_id) REFERENCES public.agent_suggestions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- On Supabase, tie profiles to the auth users table. Skipped on a plain
-- Postgres, where the local prelude has no auth.users.
DO $$ BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- 3. HELPER FUNCTIONS
-- =============================================================================

-- The tenancy key of every RLS policy.
--
-- SECURITY DEFINER on purpose: it reads profiles, and profiles has RLS of its
-- own. Evaluated as the caller, a policy on profiles that called this function
-- would recurse into itself. As the owner it reads the one row it needs and
-- returns a single uuid, so it cannot leak anything else. STABLE lets the
-- planner evaluate it once per statement instead of once per row.
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- The caller's role. Role checks live in functions (transition_stage), not in
-- RLS: RLS answers "which tenant", functions answer "which person may do this".
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.profile_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Stage -> phase. Mirrored by phaseForStage() in src/lib/pipelineStages.ts.
-- churned belongs to the customer phase: churn answers "did we keep them?".
CREATE OR REPLACE FUNCTION public.phase_for_stage(s public.pipeline_stage)
RETURNS public.pipeline_phase
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE s
    WHEN 'target'                THEN 'sdr'
    WHEN 'working'               THEN 'sdr'
    WHEN 'paused'                THEN 'sdr'
    WHEN 'disqualified'          THEN 'sdr'
    WHEN 'discovery_call'        THEN 'sales'
    WHEN 'qualified_opportunity' THEN 'sales'
    WHEN 'business_case'         THEN 'sales'
    WHEN 'sign_off'              THEN 'sales'
    WHEN 'closed_lost'           THEN 'sales'
    WHEN 'ramping'               THEN 'customer'
    WHEN 'steady'                THEN 'customer'
    WHEN 'expanding'             THEN 'customer'
    WHEN 'at_risk'               THEN 'customer'
    WHEN 'churned'               THEN 'customer'
    ELSE 'onboarding'
  END::public.pipeline_phase
$$;

-- Position on the forward path, NULL for everything else. Mirrored by
-- stageRank() in src/lib/pipelineStages.ts.
--
-- The NULLs are load-bearing. Exits (paused, disqualified, closed_lost,
-- churned) must be reachable from anywhere, and the lateral customer states
-- (expanding, at_risk) are re-entered many times in an account's life; ranking
-- either would make the one-stage-at-a-time rule and the conversion funnel
-- invent moves that never happened.
CREATE OR REPLACE FUNCTION public.pipeline_stage_rank(s public.pipeline_stage)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE s
    WHEN 'target'                THEN 1
    WHEN 'working'               THEN 2
    WHEN 'discovery_call'        THEN 3
    WHEN 'qualified_opportunity' THEN 4
    WHEN 'business_case'         THEN 5
    WHEN 'sign_off'              THEN 6
    WHEN 'closed_won'            THEN 7
    WHEN 'setup'                 THEN 8
    WHEN 'pilot_running'         THEN 9
    WHEN 'pilot_review'          THEN 10
    WHEN 'adoption'              THEN 11
    WHEN 'ramping'               THEN 12
    WHEN 'steady'                THEN 13
    ELSE NULL
  END
$$;


-- =============================================================================
-- 4. transition_stage(): the only way a pipeline stage moves
--
-- Every sales rule that must hold is checked here, in the database, so no
-- client (the web app, a script, an AI agent acting as the user) can skip it.
-- The same gates are mirrored in src/lib/stageReadiness.ts so the UI can warn
-- while the user is still typing; this function is the enforcement.
--
-- It raises flag app.transition_stage_active for the duration of its UPDATE;
-- the guard trigger on accounts refuses any stage change made without it.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.transition_stage(
  p_account_id uuid,
  p_new_stage  public.pipeline_stage,
  p_metadata   jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_role       public.profile_role;
  v_caller_org uuid;
  v_account    public.accounts;
  v_current    public.pipeline_stage;
  v_old_phase  public.pipeline_phase;
  v_new_phase  public.pipeline_phase;
  v_qc         jsonb;
  v_item       text;
  v_from_rank  integer;
  v_to_rank    integer;
  v_meta       jsonb := coalesce(p_metadata, '{}'::jsonb);
  -- The qualification checklist. Each item needs a definite yes or no.
  v_required_items text[] := ARRAY[
    'is_decision_maker', 'pain_exists_genuinely', 'budget_path',
    'timeline', 'champion', 'technical_fit'
  ];
  -- The subset that must be YES. Without a decision maker, genuine pain, or a
  -- path to budget there is no opportunity, whatever the other answers say.
  v_affirmative_items text[] := ARRAY[
    'is_decision_maker', 'pain_exists_genuinely', 'budget_path'
  ];
BEGIN
  SELECT p.role, p.organization_id INTO v_role, v_caller_org
    FROM public.profiles p WHERE p.user_id = v_caller;
  IF v_caller IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'caller has no profile' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_account FROM public.accounts WHERE id = p_account_id;
  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'transition_stage: account % not found', p_account_id USING ERRCODE = 'P0002';
  END IF;

  -- SECURITY DEFINER bypasses RLS, so tenancy is checked by hand.
  IF v_account.organization_id IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'transition_stage: cross-tenant access denied' USING ERRCODE = '42501';
  END IF;

  v_current   := v_account.pipeline_stage;
  v_old_phase := v_account.pipeline_phase;
  v_new_phase := public.phase_for_stage(p_new_stage);

  IF p_new_stage IN ('qualified_opportunity', 'sign_off', 'closed_won') AND v_role <> 'founder' THEN
    RAISE EXCEPTION 'transition_stage: % requires founder role', p_new_stage USING ERRCODE = '42501';
  END IF;

  v_qc := v_account.qualification_checklist;
  IF p_new_stage = 'qualified_opportunity' THEN
    -- Only a JSON boolean counts as an answer; null, a string or a missing
    -- item is "unanswered". coalesce() keeps a NULL comparison from silently
    -- passing the gate.
    FOREACH v_item IN ARRAY v_required_items LOOP
      IF coalesce(jsonb_typeof(v_qc -> v_item -> 'answer'), '') <> 'boolean' THEN
        RAISE EXCEPTION 'transition_stage: qualification item % unanswered', v_item
          USING ERRCODE = 'P0001';
      END IF;
    END LOOP;

    FOREACH v_item IN ARRAY v_affirmative_items LOOP
      IF (v_qc -> v_item -> 'answer') IS DISTINCT FROM 'true'::jsonb THEN
        RAISE EXCEPTION
          'transition_stage: qualified_opportunity requires % to be answered yes, not just answered', v_item
          USING ERRCODE = 'P0001';
      END IF;
    END LOOP;

    v_qc := coalesce(v_qc, '{}'::jsonb) || jsonb_build_object(
      'founder_approved', jsonb_build_object(
        'answer', true, 'approver_id', v_caller, 'approved_at', to_jsonb(now())
      )
    );
  END IF;

  -- One stage at a time. A jump like target -> sign_off would write a clean
  -- history row that quietly poisons every conversion number computed from
  -- that history. Unranked stages stay unconstrained: a deal has to be able
  -- to die from anywhere.
  v_from_rank := public.pipeline_stage_rank(v_current);
  v_to_rank   := public.pipeline_stage_rank(p_new_stage);
  IF v_from_rank IS NOT NULL AND v_to_rank IS NOT NULL AND v_to_rank > v_from_rank + 1 THEN
    RAISE EXCEPTION
      'transition_stage: cannot skip from % to % -- advance one stage at a time', v_current, p_new_stage
      USING ERRCODE = 'P0001';
  END IF;

  -- You cannot build a business case for an amount nobody has stated.
  IF p_new_stage = 'business_case' AND coalesce(v_account.mrr, 0) <= 0 THEN
    RAISE EXCEPTION
      'transition_stage: business_case requires accounts.mrr > 0 -- state the deal size before building the case'
      USING ERRCODE = 'P0001';
  END IF;

  -- Whoever customer success reports results to has to exist before the close.
  IF p_new_stage = 'closed_won' AND NOT EXISTS (
    SELECT 1 FROM public.contacts c
     WHERE c.account_id = p_account_id
       AND c.role_in_deal = 'decision_maker'
       AND c.deal_engagement = 'engaged'
  ) THEN
    RAISE EXCEPTION
      'transition_stage: closed_won requires at least one contact with role_in_deal=decision_maker and deal_engagement=engaged'
      USING ERRCODE = 'P0001';
  END IF;

  -- The engaged budget owner approves the recurring payment; without one the
  -- first invoice stalls after go-live.
  IF p_new_stage = 'closed_won' AND NOT EXISTS (
    SELECT 1 FROM public.contacts c
     WHERE c.account_id = p_account_id
       AND c.role_in_deal = 'budget_owner'
       AND c.deal_engagement = 'engaged'
  ) THEN
    RAISE EXCEPTION
      'transition_stage: closed_won requires an engaged budget_owner contact -- who approves the recurring payment before go-live'
      USING ERRCODE = 'P0001';
  END IF;

  -- First usage is the real close: value only shows once the product is used. The escape hatch,
  -- metadata.golive_confirmed = true, is for accounts whose usage sync has not
  -- caught up; it is auditable because the metadata lands in the history row.
  IF p_new_stage = 'pilot_running'
     AND v_account.first_usage_at IS NULL
     AND coalesce(v_meta ->> 'golive_confirmed', '') <> 'true' THEN
    RAISE EXCEPTION
      'transition_stage: pilot_running means live WITH real usage -- wait for first_usage_at, or pass metadata.golive_confirmed=true if usage is confirmed outside the sync'
      USING ERRCODE = 'P0001';
  END IF;

  -- Every exit records why.
  IF p_new_stage = 'closed_lost' AND nullif(v_meta ->> 'loss_reason_category', '') IS NULL THEN
    RAISE EXCEPTION 'transition_stage: closed_lost requires loss_reason_category' USING ERRCODE = '23514';
  END IF;
  IF p_new_stage = 'disqualified' AND nullif(v_meta ->> 'disqualify_reason', '') IS NULL THEN
    RAISE EXCEPTION 'transition_stage: disqualified requires disqualify_reason' USING ERRCODE = '23514';
  END IF;
  IF p_new_stage = 'churned' AND nullif(v_meta ->> 'churn_reason', '') IS NULL THEN
    RAISE EXCEPTION 'transition_stage: churned requires churn_reason' USING ERRCODE = '23514';
  END IF;

  -- In the customer phase the classifier owns the stage; a human move there
  -- overrides it (a "pin") and has to say why.
  IF v_new_phase = 'customer'
     AND p_new_stage <> 'churned'
     AND coalesce(btrim(v_meta ->> 'pin_reason'), '') = '' THEN
    RAISE EXCEPTION 'transition_stage: moving to % requires metadata.pin_reason', p_new_stage
      USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('app.transition_stage_active', 'true', true);

  UPDATE public.accounts
  SET
    pipeline_stage = p_new_stage,
    pipeline_phase = v_new_phase,
    founder_approved_at = CASE WHEN p_new_stage = 'qualified_opportunity' THEN now() ELSE founder_approved_at END,
    founder_approved_by = CASE WHEN p_new_stage = 'qualified_opportunity' THEN v_caller ELSE founder_approved_by END,
    qualification_checklist = CASE WHEN p_new_stage = 'qualified_opportunity' THEN v_qc ELSE qualification_checklist END,
    customer_since = CASE
      WHEN p_new_stage = 'closed_won' AND customer_since IS NULL THEN current_date
      ELSE customer_since END,
    -- Observed, not typed: stamped on the first entry into pilot_running.
    golive_at = CASE
      WHEN p_new_stage = 'pilot_running' AND golive_at IS NULL THEN now()
      ELSE golive_at END,
    expected_close_date = CASE
      WHEN v_old_phase = 'sales' AND v_new_phase IN ('onboarding', 'customer') AND expected_close_date IS NULL
        THEN current_date
      ELSE expected_close_date END,
    customer_stage_pinned_at = CASE WHEN v_new_phase = 'customer' THEN now() ELSE customer_stage_pinned_at END,
    customer_stage_pinned_by = CASE WHEN v_new_phase = 'customer' THEN v_caller ELSE customer_stage_pinned_by END,
    customer_stage_pin_reason = CASE
      WHEN v_new_phase = 'customer' THEN coalesce(v_meta ->> 'pin_reason', customer_stage_pin_reason)
      ELSE customer_stage_pin_reason END,
    customer_risk_reason = CASE
      WHEN v_new_phase = 'customer' AND p_new_stage <> 'at_risk' THEN NULL
      ELSE customer_risk_reason END,
    loss_reason_category = CASE
      WHEN p_new_stage = 'closed_lost' THEN (v_meta ->> 'loss_reason_category')::public.loss_reason_category
      ELSE loss_reason_category END,
    disqualify_reason = CASE
      WHEN p_new_stage = 'disqualified' THEN (v_meta ->> 'disqualify_reason')::public.disqualify_reason
      ELSE disqualify_reason END,
    churn_reason = CASE
      WHEN p_new_stage = 'churned' THEN (v_meta ->> 'churn_reason')::public.churn_reason
      ELSE churn_reason END,
    loss_reason_detail = CASE
      WHEN p_new_stage IN ('closed_lost', 'disqualified', 'churned')
        THEN coalesce(v_meta ->> 'loss_reason_detail', loss_reason_detail)
      ELSE loss_reason_detail END,
    lost_from_stage = CASE
      WHEN p_new_stage IN ('closed_lost', 'disqualified', 'churned') THEN v_current
      ELSE lost_from_stage END
  WHERE id = p_account_id
  RETURNING * INTO v_account;

  PERFORM set_config('app.transition_stage_active', '', true);

  RETURN to_jsonb(v_account);
END;
$$;


-- =============================================================================
-- 5. DASHBOARD AND HYGIENE FUNCTIONS
--
-- All read account_stage_history, so "what happened in this window" is
-- answered from observed moves. They are SECURITY DEFINER (they aggregate
-- across tables in one pass), so each one opens with an explicit check that
-- the requested organization is the caller's own.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.dashboard_north_star_counts(
  _org_id uuid,
  _since  timestamptz DEFAULT (now() - interval '7 days')
)
RETURNS TABLE (
  accounts_worked        bigint,
  working_count          bigint,
  discovery_call_count   bigint,
  qualified_opp_count    bigint,
  signoff_count          bigint,
  active_customer_count  bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org uuid := public.get_user_org_id();
BEGIN
  IF v_caller_org IS NOT NULL AND v_caller_org <> _org_id THEN
    RAISE EXCEPTION 'dashboard_north_star_counts: org % is not the caller''s org', _org_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH moves AS (
    SELECT h.account_id, h.to_stage
      FROM public.account_stage_history h
     WHERE h.organization_id = _org_id
       AND h.entered_at >= _since
       -- Reconstructed history is not activity inside the window.
       AND h.source <> 'backfill_events'
  )
  SELECT
    (SELECT count(DISTINCT m.account_id) FROM moves m),
    (SELECT count(DISTINCT m.account_id) FROM moves m WHERE m.to_stage = 'working'),
    (SELECT count(DISTINCT m.account_id) FROM moves m WHERE m.to_stage = 'discovery_call'),
    (SELECT count(DISTINCT m.account_id) FROM moves m WHERE m.to_stage = 'qualified_opportunity'),
    (SELECT count(DISTINCT m.account_id) FROM moves m WHERE m.to_stage = 'sign_off'),
    (SELECT count(*) FROM public.accounts a
      WHERE a.organization_id = _org_id
        AND a.pipeline_phase = 'customer'
        AND a.pipeline_stage <> 'churned');
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_loss_reasons(
  _org_id uuid,
  _since  timestamptz DEFAULT (now() - interval '90 days')
)
RETURNS TABLE (
  loss_reason_category public.loss_reason_category,
  lost_from_stage      public.pipeline_stage,
  account_count        bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org uuid := public.get_user_org_id();
BEGIN
  IF v_caller_org IS NOT NULL AND v_caller_org <> _org_id THEN
    RAISE EXCEPTION 'dashboard_loss_reasons: org % is not the caller''s org', _org_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.loss_reason_category,
    coalesce(h.from_stage, a.lost_from_stage),
    count(DISTINCT a.id)
  FROM public.account_stage_history h
  JOIN public.accounts a ON a.id = h.account_id AND a.organization_id = h.organization_id
  WHERE h.organization_id = _org_id
    AND h.to_stage = 'closed_lost'
    AND h.entered_at >= _since
    AND h.source <> 'backfill_events'
    AND a.loss_reason_category IS NOT NULL
  GROUP BY a.loss_reason_category, coalesce(h.from_stage, a.lost_from_stage);
END;
$$;

-- The sales funnel with FLOW semantics: for each step of the sales spine, the
-- cohort of accounts that ENTERED it inside the window; converted = later
-- reached a stage at or beyond the next one (skipping a stage is not a loss).
-- The last step is not closed_won but first real usage inside the window.
--
-- _include_legacy adds a current-state backstop for live accounts whose trip
-- through the spine predates the window. It changes what the numbers mean,
-- so it is off unless asked for.
CREATE OR REPLACE FUNCTION public.dashboard_sales_funnel(
  _org_id         uuid,
  _since          timestamptz,
  _include_legacy boolean DEFAULT false
)
RETURNS TABLE (
  step                 text,
  step_order           integer,
  entered              bigint,
  arr_total            numeric,
  current_mrr_total    numeric,
  converted            bigint,
  conversion_rate      numeric,
  median_days_to_next  numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org uuid := public.get_user_org_id();
BEGIN
  IF v_caller_org IS NOT NULL AND v_caller_org <> _org_id THEN
    RAISE EXCEPTION 'dashboard_sales_funnel: org % is not the caller''s org', _org_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH entries AS (
    -- First forward entry per account per ranked stage inside the window.
    -- All ranked stages, not only the spine, so "reached or passed" sees skips.
    SELECT h.account_id,
           h.to_stage AS stage,
           public.pipeline_stage_rank(h.to_stage) AS stage_rank,
           min(h.entered_at) AS entered_at
      FROM public.account_stage_history h
     WHERE h.organization_id = _org_id
       AND h.entered_at >= _since
       AND h.source <> 'backfill_events'
       AND public.pipeline_stage_rank(h.to_stage) IS NOT NULL
     GROUP BY h.account_id, h.to_stage
  ),
  wins AS (
    SELECT a.id AS account_id, a.arr, a.mrr
      FROM public.accounts a
     WHERE a.organization_id = _org_id
       AND a.first_usage_at >= _since
  ),
  legacy AS (
    SELECT a.id AS account_id, a.arr, a.mrr
      FROM public.accounts a
     WHERE _include_legacy
       AND a.organization_id = _org_id
       AND (a.first_usage_at IS NOT NULL
            OR a.pipeline_stage IN ('pilot_running', 'pilot_review', 'adoption',
                                    'ramping', 'steady', 'expanding', 'at_risk'))
  ),
  spine AS (
    SELECT e.account_id, e.stage, e.stage_rank, e.entered_at,
           a.arr, a.mrr, a.first_usage_at
      FROM entries e
      JOIN public.accounts a ON a.id = e.account_id
     WHERE e.stage IN ('working', 'discovery_call', 'qualified_opportunity',
                       'business_case', 'sign_off')
  ),
  outcomes AS (
    SELECT s.account_id, s.stage, s.stage_rank, s.entered_at, s.arr, s.mrr,
           CASE
             WHEN s.stage = 'sign_off' THEN
               -- The step after the commercial yes is real usage.
               CASE WHEN s.first_usage_at >= s.entered_at THEN s.first_usage_at END
             ELSE
               (SELECT min(n.entered_at)
                  FROM entries n
                 WHERE n.account_id = s.account_id
                   AND n.stage_rank >= s.stage_rank + 1
                   AND n.entered_at >= s.entered_at)
           END AS next_at
      FROM spine s
  ),
  measured AS (
    SELECT o.stage::text AS m_step,
           o.stage_rank  AS m_rank,
           o.arr         AS m_arr,
           o.mrr         AS m_mrr,
           (o.next_at IS NOT NULL
             OR EXISTS (SELECT 1 FROM legacy l WHERE l.account_id = o.account_id)) AS m_converted,
           CASE WHEN o.next_at IS NOT NULL
                THEN (extract(epoch FROM (o.next_at - o.entered_at)) / 86400.0)::double precision
           END AS m_days
      FROM outcomes o
  ),
  backstop AS (
    -- Legacy accounts with no visible windowed entry count as one entered and
    -- converted unit in each spine step.
    SELECT sd.stage AS m_step, sd.stage_rank AS m_rank,
           l.arr AS m_arr, l.mrr AS m_mrr,
           true AS m_converted, NULL::double precision AS m_days
      FROM legacy l
     CROSS JOIN (VALUES
       ('working', 2), ('discovery_call', 3), ('qualified_opportunity', 4),
       ('business_case', 5), ('sign_off', 6)
     ) AS sd(stage, stage_rank)
     WHERE NOT EXISTS (
       SELECT 1 FROM spine s WHERE s.account_id = l.account_id AND s.stage::text = sd.stage
     )
  ),
  all_rows AS (
    SELECT * FROM measured
    UNION ALL
    SELECT * FROM backstop
  ),
  spine_steps AS (
    SELECT r.m_step                                            AS step,
           r.m_rank - 1                                        AS step_order,
           count(*)                                            AS entered,
           coalesce(sum(r.m_arr), 0)::numeric                  AS arr_total,
           coalesce(sum(r.m_mrr), 0)::numeric                  AS current_mrr_total,
           count(*) FILTER (WHERE r.m_converted)               AS converted,
           round(count(*) FILTER (WHERE r.m_converted)::numeric / count(*), 4) AS conversion_rate,
           round((percentile_cont(0.5) WITHIN GROUP (ORDER BY r.m_days))::numeric, 1) AS median_days_to_next
      FROM all_rows r
     GROUP BY r.m_step, r.m_rank
  ),
  won AS (
    SELECT 'first_usage'::text                   AS step,
           6                                     AS step_order,
           count(*)::bigint                      AS entered,
           coalesce(sum(t.arr), 0)::numeric      AS arr_total,
           coalesce(sum(t.mrr), 0)::numeric      AS current_mrr_total,
           NULL::bigint                          AS converted,
           NULL::numeric                         AS conversion_rate,
           NULL::numeric                         AS median_days_to_next
      FROM (SELECT account_id, arr, mrr FROM wins
            UNION
            SELECT account_id, arr, mrr FROM legacy) t
  )
  SELECT * FROM spine_steps
  UNION ALL
  SELECT * FROM won
  ORDER BY 2;
END;
$$;

-- Pipeline hygiene: one row per (account, broken rule), at drill-down grain.
-- The counter board aggregates these rows client-side, so a count and the
-- accounts behind it always come from the same data.
--
-- The red belongs to the revenue owner before the close and to the delivery
-- owner from the commercial yes onward.
CREATE OR REPLACE FUNCTION public.account_hygiene_flags(_org_id uuid)
RETURNS TABLE (
  account_id          uuid,
  account_name        text,
  pipeline_stage      public.pipeline_stage,
  flag                text,
  detail              text,
  owner_user_id       uuid,
  owner_display_name  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org uuid := public.get_user_org_id();
  v_today      date := current_date;
  v_stale_days integer;
BEGIN
  IF v_caller_org IS NOT NULL AND v_caller_org <> _org_id THEN
    RAISE EXCEPTION 'account_hygiene_flags: org % is not the caller''s org', _org_id
      USING ERRCODE = '42501';
  END IF;

  v_stale_days := coalesce(
    (SELECT o.hygiene_stale_days FROM public.org_settings o WHERE o.organization_id = _org_id), 7);

  RETURN QUERY
  WITH base AS (
    SELECT a.id, a.name, a.pipeline_stage AS stage,
           a.industry, a.segment, a.mrr, a.first_usage_at,
           CASE
             WHEN a.pipeline_stage IN ('working', 'discovery_call', 'qualified_opportunity',
                                       'business_case', 'sign_off')
               THEN a.revenue_owner_id
             ELSE coalesce(a.delivery_owner_id, a.revenue_owner_id)
           END AS owner_id,
           floor(extract(epoch FROM (now() - h.entered_at)) / 86400)::integer AS days_in_stage,
           coalesce(a.pipeline_stage IN ('working', 'discovery_call', 'qualified_opportunity',
                                         'business_case', 'sign_off', 'closed_won', 'setup',
                                         'pilot_running'), false) AS is_live
      FROM public.accounts a
      LEFT JOIN public.account_stage_history h
        ON h.account_id = a.id AND h.exited_at IS NULL AND h.source <> 'backfill_events'
     WHERE a.organization_id = _org_id
  ),
  open_task AS (
    -- Open, top-level tasks: a subtask is detail of another task, not the
    -- account's next step.
    SELECT t.account_id, t.name, t.due_date, t.position
      FROM public.tasks t
      JOIN base b ON b.id = t.account_id
     WHERE t.parent_id IS NULL
       AND t.status NOT IN ('done', 'cancelled')
  ),
  open_count AS (
    SELECT o.account_id, count(*) AS n FROM open_task o GROUP BY o.account_id
  ),
  -- The next step: the open task with the nearest due date.
  next_action AS (
    SELECT DISTINCT ON (o.account_id) o.account_id, o.name, o.due_date
      FROM open_task o
     WHERE o.due_date IS NOT NULL
     ORDER BY o.account_id, o.due_date, o.position
  ),
  roles AS (
    SELECT b.id,
           EXISTS (SELECT 1 FROM public.contacts c
                    WHERE c.account_id = b.id AND c.role_in_deal = 'champion') AS has_champion,
           EXISTS (SELECT 1 FROM public.contacts c
                    WHERE c.account_id = b.id AND c.role_in_deal = 'decision_maker') AS has_sponsor
      FROM base b
  ),
  flags AS (
    -- 1. No next step: a task and a date are one commitment; missing either counts.
    SELECT b.id, b.name, b.stage, 'no_next_step'::text AS flag,
           CASE WHEN coalesce(oc.n, 0) = 0 THEN 'No next step recorded'
                ELSE 'Next step has no due date' END AS detail,
           b.owner_id
      FROM base b
      LEFT JOIN open_count oc ON oc.account_id = b.id
      LEFT JOIN next_action na ON na.account_id = b.id
     WHERE b.is_live AND na.account_id IS NULL

    UNION ALL
    -- 2. Next step overdue: a promise we made and broke.
    SELECT b.id, b.name, b.stage, 'next_step_overdue',
           (v_today - na.due_date) || 'd overdue: ' || na.name,
           b.owner_id
      FROM base b
      JOIN next_action na ON na.account_id = b.id
     WHERE b.is_live AND na.due_date < v_today

    UNION ALL
    -- 3. Stuck in stage longer than the workspace allows.
    SELECT b.id, b.name, b.stage, 'stuck_in_stage',
           b.days_in_stage || 'd in stage (limit ' || v_stale_days || 'd)',
           b.owner_id
      FROM base b
     WHERE b.is_live AND b.days_in_stage > v_stale_days

    UNION ALL
    -- 4. Single-threaded: no champion, or no executive sponsor late in the deal.
    SELECT b.id, b.name, b.stage, 'missing_contact_roles',
           CASE WHEN NOT r.has_champion THEN 'No champion identified'
                ELSE 'No executive sponsor (decision maker) from business case on' END,
           b.owner_id
      FROM base b
      JOIN roles r ON r.id = b.id
     WHERE b.is_live AND b.stage <> 'working'
       AND (NOT r.has_champion
            OR (b.stage IN ('business_case', 'sign_off', 'closed_won', 'setup', 'pilot_running')
                AND NOT r.has_sponsor))

    UNION ALL
    -- 5. Basics missing.
    SELECT b.id, b.name, b.stage, 'missing_basics',
           concat_ws(' · ',
             CASE WHEN nullif(b.industry, '') IS NULL THEN 'industry' END,
             CASE WHEN nullif(b.segment, '') IS NULL THEN 'segment' END,
             CASE WHEN coalesce(b.mrr, 0) <= 0
                   AND b.stage IN ('qualified_opportunity', 'business_case', 'sign_off',
                                   'closed_won', 'setup', 'pilot_running')
                  THEN 'projected MRR' END),
           b.owner_id
      FROM base b
     WHERE b.is_live
       AND (nullif(b.industry, '') IS NULL
            OR nullif(b.segment, '') IS NULL
            OR (coalesce(b.mrr, 0) <= 0
                AND b.stage IN ('qualified_opportunity', 'business_case', 'sign_off',
                                'closed_won', 'setup', 'pilot_running')))

    UNION ALL
    -- 6. Uncovered: no future meeting on the calendar. Lifecycle rows on the
    --    timeline are audit entries, not meetings.
    SELECT b.id, b.name, b.stage, 'no_future_meeting',
           'No future meeting on the calendar',
           b.owner_id
      FROM base b
     WHERE b.stage IN ('qualified_opportunity', 'business_case', 'sign_off', 'closed_won', 'setup')
       AND NOT EXISTS (
         SELECT 1 FROM public.events e
          WHERE e.account_id = b.id
            AND coalesce(e.group_label, '') <> 'lifecycle'
            AND coalesce(e.scheduled_at >= now(), e.date >= v_today)
       )

    UNION ALL
    -- 7. Near money, stalled: signed but not live, or live with no usage.
    --    The hardest rule, and a same-day fix.
    SELECT b.id, b.name, b.stage, 'near_money_stalled',
           CASE WHEN b.stage = 'pilot_running'
                THEN 'Live for ' || b.days_in_stage || 'd with no usage recorded'
                ELSE 'Signed ' || b.days_in_stage || 'd ago, not live yet' END,
           b.owner_id
      FROM base b
     WHERE b.days_in_stage IS NOT NULL
       AND ((b.stage IN ('closed_won', 'setup') AND b.days_in_stage > 2)
            OR (b.stage = 'pilot_running' AND b.days_in_stage > 7 AND b.first_usage_at IS NULL))
  )
  SELECT f.id, f.name, f.stage, f.flag, f.detail, f.owner_id, p.display_name
    FROM flags f
    LEFT JOIN public.profiles p ON p.user_id = f.owner_id
   ORDER BY
     CASE f.flag
       WHEN 'near_money_stalled' THEN 0
       WHEN 'next_step_overdue'  THEN 1
       WHEN 'no_next_step'       THEN 2
       WHEN 'no_future_meeting'  THEN 3
       WHEN 'stuck_in_stage'     THEN 4
       ELSE 9
     END,
     f.name;
END;
$$;


-- =============================================================================
-- 6. VIEWS
--
-- security_invoker = true: a view runs with the caller's permissions, so the
-- RLS policies of the underlying tables apply to it as well.
-- =============================================================================

-- Who is engaged on each deal. Dead deals (lost, disqualified, churned) keep
-- their row but count nothing, so coverage is about deals still worth covering.
CREATE OR REPLACE VIEW public.account_deal_coverage
WITH (security_invoker = true) AS
WITH scoped AS (
  SELECT a.id              AS account_id,
         a.organization_id AS organization_id,
         a.pipeline_phase  AS pipeline_phase,
         a.pipeline_stage  AS pipeline_stage,
         (a.pipeline_stage IS NULL
           OR a.pipeline_stage NOT IN ('disqualified', 'closed_lost', 'churned')) AS deal_is_live,
         c.role_in_deal    AS role_in_deal,
         c.deal_engagement AS deal_engagement
    FROM public.accounts a
    LEFT JOIN public.contacts c ON c.account_id = a.id
)
SELECT s.account_id,
       s.organization_id,
       s.pipeline_phase,
       s.pipeline_stage,
       count(*) FILTER (WHERE s.deal_is_live AND s.deal_engagement = 'engaged') AS engaged_contacts_count,
       coalesce(bool_or(s.deal_is_live AND s.role_in_deal = 'champion'
                        AND s.deal_engagement = 'engaged'), false) AS champion_engaged,
       coalesce(bool_or(s.deal_is_live AND s.role_in_deal = 'decision_maker'
                        AND s.deal_engagement = 'engaged'), false) AS decision_maker_engaged,
       (count(*) FILTER (WHERE s.deal_is_live AND s.deal_engagement = 'engaged') >= 2) AS multi_threaded
  FROM scoped s
 GROUP BY s.account_id, s.organization_id, s.pipeline_phase, s.pipeline_stage;

-- The inputs of the customer classifier: one row per live customer, plus
-- accounts in adoption.
--
-- In this edition the classifier itself lives in the application layer
-- (src/lib/customerSignals.ts, run by the "Reclassify" action). In production
-- it is a nightly job that reads this view and writes stage + risk reason
-- through the stage guard with app.customer_classifier_active and
-- app.system_stage_advance set, so the history row records source =
-- 'classifier'. Either way the rules read the same numbers, from here.
--
-- Usage windows are the last 4 COMPLETE weeks against the 4 before them; the
-- current, partial week is never compared with a full one.
CREATE OR REPLACE VIEW public.account_customer_signals
WITH (security_invoker = true) AS
WITH bounds AS (
  -- Monday 00:00 UTC of the current week.
  SELECT date_trunc('week', now() AT TIME ZONE 'UTC')::date AS w0
)
SELECT a.id AS account_id,
       a.organization_id,
       a.pipeline_stage,
       a.customer_since,
       a.first_usage_at,
       (u.last_used_week::timestamp AT TIME ZONE 'UTC') AS last_usage_at,
       a.reactivated_at,
       a.customer_stage_pinned_at,
       coalesce(u.curr_4w, 0) AS usage_4w,
       coalesce(u.prev_4w, 0) AS usage_prev_4w,
       CASE WHEN coalesce(u.prev_4w, 0) > 0
            THEN round((coalesce(u.curr_4w, 0) - u.prev_4w) / u.prev_4w, 3)
       END AS usage_delta_pct,
       CASE WHEN u.last_used_week IS NOT NULL
            THEN greatest(0, (b.w0 - u.last_used_week) / 7 - 1)
       END AS weeks_since_last_usage,
       CASE WHEN a.last_activity_at IS NOT NULL
            THEN floor(extract(epoch FROM (now() - a.last_activity_at)) / 86400)::integer
       END AS days_since_last_activity,
       h.health_score,
       h.health_logged_at,
       h.health_delta_30d,
       CASE
         WHEN a.first_usage_at IS NULL THEN NULL
         WHEN now() - a.first_usage_at < interval '30 days' THEN 'M0'
         ELSE 'M1+'
       END AS cohort,
       CASE
         WHEN coalesce(u.n_rows, 0) = 0 THEN 'none'
         WHEN a.first_usage_at IS NOT NULL AND now() - a.first_usage_at < interval '28 days' THEN 'partial'
         ELSE 'full'
       END AS signal_quality,
       a.customer_risk_reason
  FROM public.accounts a
 CROSS JOIN bounds b
  LEFT JOIN LATERAL (
    SELECT count(*) AS n_rows,
           sum(uw.units) FILTER (WHERE uw.week_start >= b.w0 - 28 AND uw.week_start < b.w0)      AS curr_4w,
           sum(uw.units) FILTER (WHERE uw.week_start >= b.w0 - 56 AND uw.week_start < b.w0 - 28) AS prev_4w,
           max(uw.week_start) FILTER (WHERE uw.units > 0) AS last_used_week
      FROM public.usage_weekly uw
     WHERE uw.account_id = a.id
  ) u ON true
  LEFT JOIN LATERAL (
    SELECT l.total_score AS health_score,
           l.logged_at   AS health_logged_at,
           l.total_score - (
             SELECT l2.total_score FROM public.health_score_logs l2
              WHERE l2.account_id = a.id AND l2.logged_at <= now() - interval '30 days'
              ORDER BY l2.logged_at DESC LIMIT 1
           ) AS health_delta_30d
      FROM public.health_score_logs l
     WHERE l.account_id = a.id
     ORDER BY l.logged_at DESC
     LIMIT 1
  ) h ON true
 WHERE a.pipeline_phase = 'customer' OR a.pipeline_stage = 'adoption';

-- This month's model spend against the organization's cap. Spend is tokens
-- used by this month's meeting extractions at a blended ~$4 per million tokens.
CREATE OR REPLACE VIEW public.agent_cost_state
WITH (security_invoker = true) AS
SELECT s.organization_id,
       s.monthly_cost_cap_usd,
       s.cost_capped_at,
       sp.spend AS current_month_spend_usd,
       CASE WHEN s.monthly_cost_cap_usd > 0
            THEN round(sp.spend / s.monthly_cost_cap_usd * 100, 1)
       END AS percent_of_cap
  FROM public.agent_settings s
 CROSS JOIN LATERAL (
   SELECT round(coalesce(sum(m.tokens_used), 0) / 1000000.0 * 4, 2) AS spend
     FROM public.meeting_ingests m
    WHERE m.organization_id = s.organization_id
      AND m.created_at >= date_trunc('month', now())
 ) sp;


-- =============================================================================
-- 7. TRIGGERS
--
-- The TypeScript twins live in src/demo/triggers.ts. Postgres fires triggers
-- of the same timing in name order, so names on accounts carry a numeric
-- prefix where the order matters (the guard must run before anything writes).
-- =============================================================================

-- 7.1 updated_at ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations', 'profiles', 'accounts', 'contacts', 'activities', 'tasks', 'notes',
    'discovery_notes', 'health_metrics', 'health_metric_profiles', 'meeting_ingests',
    'agent_suggestions', 'agent_settings', 'org_settings'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_90_touch_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
      t || '_90_touch_updated_at', t);
  END LOOP;
END $$;

-- 7.2 accounts: insert-time derivations ---------------------------------------

-- The phase is a function of the stage; it is stored only so it can be indexed.
CREATE OR REPLACE FUNCTION public.derive_pipeline_phase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pipeline_stage IS NOT NULL THEN
    NEW.pipeline_phase := public.phase_for_stage(NEW.pipeline_stage);
  END IF;
  RETURN NEW;
END;
$$;

-- ACME, ACME2, ... unique per organization.
CREATE OR REPLACE FUNCTION public.generate_account_code_prefix()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_base      text;
  v_candidate text;
  v_suffix    integer := 2;
BEGIN
  IF NEW.code_prefix IS NOT NULL THEN
    NEW.code_prefix := nullif(upper(regexp_replace(NEW.code_prefix, '[^A-Za-z0-9]', '', 'g')), '');
  END IF;
  IF NEW.code_prefix IS NULL THEN
    v_base := upper(regexp_replace(coalesce(NEW.name, ''), '[^A-Za-z0-9]', '', 'g'));
    IF v_base = '' THEN v_base := 'ACC'; END IF;
    v_base := substr(v_base, 1, 4);
    v_candidate := v_base;
    WHILE EXISTS (
      SELECT 1 FROM public.accounts
       WHERE organization_id = NEW.organization_id AND code_prefix = v_candidate
    ) LOOP
      v_candidate := v_base || v_suffix::text;
      v_suffix := v_suffix + 1;
    END LOOP;
    NEW.code_prefix := v_candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_10_derive_pipeline_phase ON public.accounts;
CREATE TRIGGER accounts_10_derive_pipeline_phase
  BEFORE INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.derive_pipeline_phase();

DROP TRIGGER IF EXISTS accounts_20_generate_code_prefix ON public.accounts;
CREATE TRIGGER accounts_20_generate_code_prefix
  BEFORE INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.generate_account_code_prefix();

-- 7.3 accounts: the stage guard -------------------------------------------------
--
-- The rules in transition_stage() are only worth anything if there is no
-- other way in. This trigger refuses any UPDATE that changes pipeline_stage
-- unless one of two transaction-local flags is set:
--   app.transition_stage_active  set by transition_stage() itself;
--   app.system_stage_advance     set by trusted server-side jobs (the customer
--                                classifier, the lifecycle undo).
-- set_config(..., true) scopes both to the current transaction, so a client
-- cannot leave one switched on.

CREATE OR REPLACE FUNCTION public.guard_pipeline_stage_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
    IF coalesce(current_setting('app.transition_stage_active', true), '') = 'true' THEN
      RETURN NEW;
    END IF;
    IF coalesce(current_setting('app.system_stage_advance', true), '') = 'true' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'pipeline_stage may only be changed via public.transition_stage()'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_30_guard_pipeline_stage ON public.accounts;
CREATE TRIGGER accounts_30_guard_pipeline_stage
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_pipeline_stage_writes();

-- 7.4 accounts: the lifecycle event ----------------------------------------------
--
-- Every stage move leaves a system event on the account's timeline, so the
-- activity feed and the history always agree. app.suppress_lifecycle_log = 'on'
-- skips it (used when undoing a move: the undo must not log a new one).

CREATE OR REPLACE FUNCTION public.log_lifecycle_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('app.suppress_lifecycle_log', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage AND NEW.pipeline_stage IS NOT NULL THEN
    INSERT INTO public.events (
      account_id, organization_id, user_id, type, channel, direction,
      title, summary, group_label, date
    ) VALUES (
      NEW.id,
      NEW.organization_id,
      coalesce(auth.uid(), NEW.organization_id),
      'system', 'system', 'internal',
      'Stage: ' || NEW.pipeline_stage::text,
      CASE
        WHEN OLD.pipeline_stage IS NULL THEN 'Stage set to ' || NEW.pipeline_stage::text
        ELSE 'Moved from ' || OLD.pipeline_stage::text || ' to ' || NEW.pipeline_stage::text
      END,
      'lifecycle',
      current_date
    );

    IF NEW.pipeline_stage = 'closed_won' AND NEW.customer_since IS NULL THEN
      NEW.customer_since := current_date;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_40_log_lifecycle_change ON public.accounts;
CREATE TRIGGER accounts_40_log_lifecycle_change
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.log_lifecycle_change();

-- 7.5 accounts: stage history ------------------------------------------------------
--
-- On every stage change (and on insert), close the account's open interval and
-- open a new one. The history is the dashboards' source of truth, so it is
-- written here, by the database, whatever path moved the stage; clients can
-- read it but not write it (see grants). The exit reasons in force at the
-- moment of the move are snapshotted into metadata.

CREATE OR REPLACE FUNCTION public.sync_account_stage_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_at         timestamptz := clock_timestamp();
  v_from_stage public.pipeline_stage;
  v_from_phase public.pipeline_phase;
  v_source     text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.pipeline_stage IS NOT DISTINCT FROM OLD.pipeline_stage THEN
      RETURN NULL;
    END IF;
    v_from_stage := OLD.pipeline_stage;
    v_from_phase := OLD.pipeline_phase;
  END IF;

  UPDATE public.account_stage_history
     SET exited_at = v_at
   WHERE account_id = NEW.id AND exited_at IS NULL;

  IF NEW.pipeline_stage IS NULL THEN
    RETURN NULL;
  END IF;

  v_source := CASE
    WHEN coalesce(current_setting('app.transition_stage_active', true), '') = 'true' THEN 'transition_stage'
    WHEN coalesce(current_setting('app.customer_classifier_active', true), '') = 'true' THEN 'classifier'
    ELSE 'system'
  END;

  INSERT INTO public.account_stage_history (
    organization_id, account_id, from_stage, to_stage, from_phase, to_phase,
    entered_at, changed_by, source, arr_at_entry, metadata
  ) VALUES (
    NEW.organization_id, NEW.id,
    v_from_stage, NEW.pipeline_stage,
    v_from_phase, coalesce(NEW.pipeline_phase, public.phase_for_stage(NEW.pipeline_stage)),
    v_at, auth.uid(), v_source, NEW.arr,
    jsonb_strip_nulls(jsonb_build_object(
      'loss_reason_category', NEW.loss_reason_category,
      'disqualify_reason',    NEW.disqualify_reason,
      'churn_reason',         NEW.churn_reason,
      'loss_reason_detail',   NEW.loss_reason_detail,
      'lost_from_stage',      NEW.lost_from_stage,
      'customer_risk_reason', NEW.customer_risk_reason,
      'pin_reason',           CASE WHEN v_source = 'transition_stage' THEN NEW.customer_stage_pin_reason END
    ))
  )
  ON CONFLICT (account_id, entered_at) DO NOTHING;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS accounts_50_sync_stage_history ON public.accounts;
CREATE TRIGGER accounts_50_sync_stage_history
  AFTER INSERT OR UPDATE OF pipeline_stage ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.sync_account_stage_history();

-- 7.6 last_activity_at ----------------------------------------------------------
--
-- Notes, tasks and stage moves all count as activity on the account. The
-- column argument names the timestamp to use on the touching row. Only moves
-- the marker forward.

CREATE OR REPLACE FUNCTION public.touch_account_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row        jsonb := to_jsonb(NEW);
  v_account_id uuid  := nullif(v_row ->> 'account_id', '')::uuid;
  v_ts         timestamptz;
BEGIN
  -- A note or task need not belong to an account.
  IF v_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_ts := coalesce(nullif(v_row ->> TG_ARGV[0], '')::timestamptz, now());

  UPDATE public.accounts
     SET last_activity_at = v_ts
   WHERE id = v_account_id
     AND (last_activity_at IS NULL OR last_activity_at < v_ts)
     -- Defensive: never let a touch fail on a row the loss-reason constraint
     -- would reject (possible if the constraint is ever added NOT VALID over
     -- older data, since a CHECK is re-evaluated on every UPDATE of the row).
     AND (pipeline_stage IS DISTINCT FROM 'closed_lost' OR loss_reason_category IS NOT NULL);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_stage_history_touch_account ON public.account_stage_history;
CREATE TRIGGER account_stage_history_touch_account
  AFTER INSERT ON public.account_stage_history
  FOR EACH ROW EXECUTE FUNCTION public.touch_account_activity('entered_at');

DROP TRIGGER IF EXISTS notes_touch_account ON public.notes;
CREATE TRIGGER notes_touch_account
  AFTER INSERT OR UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_account_activity('updated_at');

DROP TRIGGER IF EXISTS tasks_touch_account ON public.tasks;
CREATE TRIGGER tasks_touch_account
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_account_activity('updated_at');

-- 7.7 tasks: code, next step, provenance -----------------------------------------

-- ACME-7: the account's code prefix plus a per-account sequence.
CREATE OR REPLACE FUNCTION public.assign_task_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_prefix text;
BEGIN
  IF NEW.account_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Lock the account row so concurrent inserts do not draw the same number.
  SELECT code_prefix INTO v_prefix FROM public.accounts WHERE id = NEW.account_id FOR UPDATE;
  IF v_prefix IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.code_number IS NULL THEN
    SELECT coalesce(max(code_number), 0) + 1 INTO NEW.code_number
      FROM public.tasks WHERE account_id = NEW.account_id;
  END IF;
  NEW.code := v_prefix || '-' || NEW.code_number::text;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_10_assign_code ON public.tasks;
CREATE TRIGGER tasks_10_assign_code
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.assign_task_code();

-- The account's next step is not a free-text field someone forgets to update:
-- it mirrors the account's open task of category 'next_step'. Completing or
-- cancelling that task clears it.
CREATE OR REPLACE FUNCTION public.sync_next_step_from_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category IS DISTINCT FROM 'next_step' OR NEW.account_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('done', 'cancelled') THEN
    UPDATE public.accounts
       SET next_step = NULL, next_step_due = NULL, next_step_task_id = NULL
     WHERE id = NEW.account_id AND next_step_task_id = NEW.id;
  ELSE
    UPDATE public.accounts
       SET next_step = NEW.name, next_step_due = NEW.due_date, next_step_task_id = NEW.id
     WHERE id = NEW.account_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_sync_next_step ON public.tasks;
CREATE TRIGGER tasks_sync_next_step
  AFTER INSERT OR UPDATE OF name, due_date, status, category ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_next_step_from_task();

CREATE OR REPLACE FUNCTION public.clear_next_step_on_task_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.accounts
     SET next_step = NULL, next_step_due = NULL, next_step_task_id = NULL
   WHERE id = OLD.account_id AND next_step_task_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tasks_clear_next_step_on_delete ON public.tasks;
CREATE TRIGGER tasks_clear_next_step_on_delete
  BEFORE DELETE ON public.tasks
  FOR EACH ROW
  WHEN (OLD.category = 'next_step' AND OLD.account_id IS NOT NULL)
  EXECUTE FUNCTION public.clear_next_step_on_task_delete();

-- Records the meeting agent created keep that provenance for good: the audit
-- trail would be meaningless if a client could flip the flag afterwards.
CREATE OR REPLACE FUNCTION public.lock_created_by_agent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_by_agent IS DISTINCT FROM OLD.created_by_agent THEN
    RAISE EXCEPTION 'created_by_agent is immutable';
  END IF;
  IF NEW.source_suggestion_id IS DISTINCT FROM OLD.source_suggestion_id THEN
    RAISE EXCEPTION 'source_suggestion_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_20_lock_agent_provenance ON public.tasks;
CREATE TRIGGER tasks_20_lock_agent_provenance
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.lock_created_by_agent();

DROP TRIGGER IF EXISTS notes_20_lock_agent_provenance ON public.notes;
CREATE TRIGGER notes_20_lock_agent_provenance
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.lock_created_by_agent();

-- 7.8 activities: account markers --------------------------------------------------

-- First worked / first engaged / first meeting move only backwards in time,
-- last activity only forwards, so importing old activity never rewrites a
-- later marker.
CREATE OR REPLACE FUNCTION public.activities_touch_account_markers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.account_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.accounts a
     SET first_worked_at = least(coalesce(a.first_worked_at, NEW.occurred_at), NEW.occurred_at),
         first_engaged_at = CASE
           WHEN NEW.meaningful_engagement
             THEN least(coalesce(a.first_engaged_at, NEW.occurred_at), NEW.occurred_at)
           ELSE a.first_engaged_at END,
         first_meeting_at = CASE
           WHEN NEW.activity_type IN ('meeting_held', 'demo')
             THEN least(coalesce(a.first_meeting_at, NEW.occurred_at), NEW.occurred_at)
           ELSE a.first_meeting_at END,
         last_activity_at = greatest(coalesce(a.last_activity_at, NEW.occurred_at), NEW.occurred_at)
   WHERE a.id = NEW.account_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activities_touch_account_markers ON public.activities;
CREATE TRIGGER activities_touch_account_markers
  AFTER INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.activities_touch_account_markers();

-- 7.9 health score ---------------------------------------------------------------

-- accounts.health_score always equals the latest logged score, so lists can
-- sort and filter on it without a join.
CREATE OR REPLACE FUNCTION public.sync_account_health_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_latest     integer;
BEGIN
  v_account_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.account_id ELSE NEW.account_id END;

  SELECT l.total_score INTO v_latest
    FROM public.health_score_logs l
   WHERE l.account_id = v_account_id
   ORDER BY l.logged_at DESC, l.created_at DESC
   LIMIT 1;

  UPDATE public.accounts SET health_score = coalesce(v_latest, 0) WHERE id = v_account_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS health_score_logs_sync_account ON public.health_score_logs;
CREATE TRIGGER health_score_logs_sync_account
  AFTER INSERT OR UPDATE OR DELETE ON public.health_score_logs
  FOR EACH ROW EXECUTE FUNCTION public.sync_account_health_score();


-- =============================================================================
-- 8. ROW-LEVEL SECURITY
--
-- The multi-tenant model in one rule: a row is visible and writable only when
-- its organization_id is the caller's (get_user_org_id()). USING filters what
-- can be read, updated or deleted; WITH CHECK stops a row being written into,
-- or moved to, another organization.
-- =============================================================================

-- Domain tables that org members read and write.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounts', 'contacts', 'events', 'event_contacts', 'activities', 'tasks', 'notes',
    'discovery_notes', 'health_metrics', 'health_metric_profiles', 'health_profile_stages',
    'health_score_logs', 'usage_weekly', 'agent_settings', 'org_settings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON public.%I FOR ALL TO authenticated '
      'USING (organization_id = public.get_user_org_id()) '
      'WITH CHECK (organization_id = public.get_user_org_id())', t);
  END LOOP;
END $$;

-- Tables written only by the database itself or by server-side jobs: members
-- of the organization read them, nobody else writes them.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['account_stage_history', 'meeting_ingests', 'agent_audit_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_read ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY org_read ON public.%I FOR SELECT TO authenticated '
      'USING (organization_id = public.get_user_org_id())', t);
  END LOOP;
END $$;

-- Suggestions are created server-side; members approve or reject them.
ALTER TABLE public.agent_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_read ON public.agent_suggestions;
CREATE POLICY org_read ON public.agent_suggestions
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());
DROP POLICY IF EXISTS org_review ON public.agent_suggestions;
CREATE POLICY org_review ON public.agent_suggestions
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

-- Organizations have no organization_id: the row IS the tenant.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_member_read ON public.organizations;
CREATE POLICY org_member_read ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.get_user_org_id() OR created_by = auth.uid());
DROP POLICY IF EXISTS org_create ON public.organizations;
CREATE POLICY org_create ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS org_member_update ON public.organizations;
CREATE POLICY org_member_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (id = public.get_user_org_id())
  WITH CHECK (id = public.get_user_org_id());

-- Profiles: see your teammates, edit only yourself.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_read ON public.profiles;
CREATE POLICY profiles_read ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR organization_id = public.get_user_org_id());
DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;
CREATE POLICY profiles_insert_self ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- =============================================================================
-- 9. GRANTS
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- History, ingests and the audit log are written by triggers and jobs only.
REVOKE INSERT, UPDATE, DELETE ON public.account_stage_history FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.meeting_ingests       FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.agent_audit_log       FROM authenticated;
REVOKE INSERT, DELETE         ON public.agent_suggestions     FROM authenticated;

-- A member edits their own display fields. organization_id and role are not
-- self-service: the row policy alone would let a member promote themselves
-- to founder and pass the founder-only stage gates.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name, avatar_url, onboarding_completed) ON public.profiles TO authenticated;

-- Views (security_invoker) and RPCs.
GRANT SELECT ON public.account_deal_coverage, public.account_customer_signals, public.agent_cost_state
  TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.transition_stage(uuid, public.pipeline_stage, jsonb),
  public.dashboard_north_star_counts(uuid, timestamptz),
  public.dashboard_loss_reasons(uuid, timestamptz),
  public.dashboard_sales_funnel(uuid, timestamptz, boolean),
  public.account_hygiene_flags(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.get_user_org_id(),
  public.get_user_role(),
  public.phase_for_stage(public.pipeline_stage),
  public.pipeline_stage_rank(public.pipeline_stage),
  public.transition_stage(uuid, public.pipeline_stage, jsonb),
  public.dashboard_north_star_counts(uuid, timestamptz),
  public.dashboard_loss_reasons(uuid, timestamptz),
  public.dashboard_sales_funnel(uuid, timestamptz, boolean),
  public.account_hygiene_flags(uuid)
  TO authenticated, service_role;
