import { createContext, useContext, useCallback, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { db } from '@/demo/db';
import { useOrgContext, orgQueryLoading } from '@/hooks/useOrgContext';
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from '@/types/database';
import { coercePipelineStage } from '@/lib/transitionStage';
import { phaseForStage } from '@/lib/pipelinePhases';
import { readIncumbentColumns, type IncumbentRow } from '@/lib/incumbentAccount';
import type { IncumbentCycle, IncumbentSource } from '@/lib/incumbentWindow';

/** Keys copied straight through from an Account patch to the accounts update. */
const INCUMBENT_COLUMNS = [
  'incumbent_vendor',
  'incumbent_last_renewal',
  'incumbent_cycle',
  'incumbent_evidence',
  'incumbent_source',
  'incumbent_captured_at',
  'incumbent_window_snoozed_until',
  'incumbent_window_disabled_reason',
] as const satisfies readonly (keyof IncumbentRow)[];

export type DbAccount = Tables<'accounts'>;

// Compatibility adapter: map DB row to legacy Account shape used by UI.
// Note: this carries both the legacy camelCase fields (UI history) AND the
// snake_case sales fields, because the pipeline kanban and the
// account workspace's sales-motion tab read those directly off the row.
export interface Account {
  id: string;
  name: string;
  healthScore: number;
  trend: 'up' | 'down' | 'flat';
  segment: string;
  mrr: number;
  channels: string[];
  tags: string[];
  industry: string;
  plan: string;
  arr: number;
  customerSince: string;
  lifecycleStage: string;
  region: string;
  codePrefix: string;
  lastContact?: string;
  mainIssue?: string;
  updatedAt?: string;
  createdAt?: string;
  // Sales-CRM additions. The kanban card and SalesMotionTab consume these
  // directly off the row; they stay snake_case to match the DB column names so
  // downstream components don't have to learn two naming conventions.
  pipeline_stage: Database['public']['Enums']['pipeline_stage'] | null;
  founder_confidence: 'low' | 'medium' | 'high' | null;
  next_step_due: string | null;
  // Two owners, not one: whoever closes the revenue and whoever runs the
  // delivery are different people on most accounts. Both nullable — a pre-sale
  // account usually has no delivery owner yet.
  revenue_owner_id: string | null;
  delivery_owner_id: string | null;
  stage_changed_at: string | null;
  // Additional sales-row fields surfaced for SalesMotionTab / SalApprovalModal
  // and downstream founder approval / loss-tracking flows.
  qualification_checklist: Json | null;
  next_step: string | null;
  /**
   * Link to the tasks row (category 'next_step') that `next_step`/`next_step_due`
   * mirror. Writes go through that task, never the mirrors.
   */
  next_step_task_id: string | null;
  expected_close_date: string | null;
  /**
   * The seller's own forecast. `expected_close_date` above is an auto-stamped
   * receipt, not a forecast, and the DB column carries a COMMENT saying so.
   */
  forecast_close_date: string | null;
  risk_notes: string | null;
  success_promise: string | null;
  loss_reason_category: Database['public']['Enums']['loss_reason_category'] | null;
  loss_reason_detail: string | null;
  lost_from_stage: Database['public']['Enums']['pipeline_stage'] | null;
  founder_approved_at: string | null;
  founder_approved_by: string | null;
  first_impact_at: string | null;
  source: string | null;
  /**
   * Go-live observations.
   * first_usage_at gates pilot_running; golive_at is stamped by
   * transition_stage on entry to pilot_running. Both observed, never typed:
   * a date someone has to remember to type goes stale.
   */
  golive_at: string | null;
  first_usage_at: string | null;
  // Incumbent displacement. Typed off src/lib/incumbentWindow
  // rather than the generated enums so this compiles before types are
  // regenerated; the shapes are identical.
  incumbent_vendor: string | null;
  incumbent_last_renewal: string | null;
  incumbent_cycle: IncumbentCycle | null;
  incumbent_evidence: string | null;
  incumbent_source: IncumbentSource | null;
  incumbent_captured_at: string | null;
  incumbent_window_snoozed_until: string | null;
  incumbent_window_disabled_reason: string | null;
  // Customer-phase columns. `pipeline_phase` is stored, not
  // derived, because the classifier writes stage and phase together and the
  // board must not disagree with the row it was classified from.
  // `customer_risk_reason` is written ONLY by the classifier — never editable.
  pipeline_phase: Database['public']['Enums']['pipeline_phase'] | null;
  customer_risk_reason: string | null;
  customer_stage_pinned_at: string | null;
  customer_stage_pin_reason: string | null;
  reactivated_at: string | null;
  // Human-declared, collected by StageReasonModal on the move into `churned`.
  // Reported separately from `loss_reason_category`: "did not buy" and "bought
  // and left" are different phenomena.
  churn_reason: Database['public']['Enums']['churn_reason'] | null;
}

/**
 * Columns added after the generated row type was last regenerated. Typed here
 * so the adapter compiles against both shapes. Grep for `ForecastColumns` to
 * find every site.
 */
type ForecastColumns = {
  forecast_close_date?: string | null;
};

/**
 * Go-live columns exist in Postgres but not yet in the
 * generated types.ts — same stopgap and same exit plan as ForecastColumns
 * above. first_usage_at predates them (customer signals) but is equally
 * absent from the generated types.
 */
type GoliveColumns = {
  golive_at?: string | null;
  first_usage_at?: string | null;
};

/**
 * `next_step_task_id` exists in Postgres but not yet in the
 * generated types.ts — same stopgap and same exit plan as ForecastColumns above.
 */
type NextStepLinkColumns = {
  next_step_task_id?: string | null;
};

/**
 * Customer-phase columns exist in Postgres but not yet in the
 * generated `types.ts`, so `DbAccount` has no idea they are there.
 *
 * ⚠️ STOPGAP. Delete this type and read the fields straight off
 * `row` once the generated types carry them. Grep for
 * `CustomerPhaseColumns` to find every site.
 */
type CustomerPhaseColumns = {
  pipeline_phase?: Database['public']['Enums']['pipeline_phase'] | null;
  customer_risk_reason?: string | null;
  customer_stage_pinned_at?: string | null;
  customer_stage_pin_reason?: string | null;
  reactivated_at?: string | null;
};

function dbToLegacy(row: DbAccount, stageChangedAt: string | null): Account {
  const customer = row as DbAccount & CustomerPhaseColumns;
  const forecast = row as DbAccount & ForecastColumns;
  const golive = row as DbAccount & GoliveColumns;
  const nextStepLink = row as DbAccount & NextStepLinkColumns;
  return {
    id: row.id,
    name: row.name,
    healthScore: row.health_score,
    trend: (row.trend as 'up' | 'down' | 'flat') || 'flat',
    segment: row.segment || '',
    mrr: Number(row.mrr) || 0,
    channels: row.channels || [],
    tags: row.tags || [],
    industry: row.industry || '',
    plan: row.plan || '',
    arr: Number(row.arr) || 0,
    customerSince: row.customer_since || '',
    lifecycleStage: row.pipeline_stage || '',
    region: row.region || '',
    codePrefix: row.code_prefix || '',
    lastContact: row.last_contact || undefined,
    // `main_issue` is intentionally NOT selected in list queries to keep
    // payloads small. Detail panels can refetch it explicitly if needed.
    mainIssue: (row as { main_issue?: string | null }).main_issue || undefined,
    updatedAt: row.updated_at || undefined,
    createdAt: row.created_at || undefined,
    // Sales fields.
    pipeline_stage: row.pipeline_stage ?? null,
    founder_confidence: row.founder_confidence ?? null,
    next_step_due: row.next_step_due ?? null,
    revenue_owner_id: row.revenue_owner_id ?? null,
    delivery_owner_id: row.delivery_owner_id ?? null,
    stage_changed_at: stageChangedAt,
    // Additional pass-through sales fields. These are read by SalesMotionTab
    // and SalApprovalModal (qualification + founder approval / loss tracking).
    qualification_checklist: row.qualification_checklist ?? null,
    next_step: row.next_step ?? null,
    next_step_task_id: nextStepLink.next_step_task_id ?? null,
    expected_close_date: row.expected_close_date ?? null,
    forecast_close_date: forecast.forecast_close_date ?? null,
    risk_notes: row.risk_notes ?? null,
    success_promise: row.success_promise ?? null,
    loss_reason_category: row.loss_reason_category ?? null,
    loss_reason_detail: row.loss_reason_detail ?? null,
    lost_from_stage: row.lost_from_stage ?? null,
    founder_approved_at: row.founder_approved_at ?? null,
    founder_approved_by: row.founder_approved_by ?? null,
    first_impact_at: row.first_impact_at ?? null,
    source: row.source ?? null,
    golive_at: golive.golive_at ?? null,
    first_usage_at: golive.first_usage_at ?? null,
    // Incumbent columns. Cast for the same reason as `main_issue` above: the
    // generated row type does not carry them until types are regenerated.
    ...readIncumbentColumns(row),
    // Customer-phase pass-through. `pipeline_phase` falls back to the derived
    // value so a row written before the backfill still lands in the right tab.
    pipeline_phase: customer.pipeline_phase ?? phaseForStage(row.pipeline_stage ?? null),
    customer_risk_reason: customer.customer_risk_reason ?? null,
    customer_stage_pinned_at: customer.customer_stage_pinned_at ?? null,
    customer_stage_pin_reason: customer.customer_stage_pin_reason ?? null,
    reactivated_at: customer.reactivated_at ?? null,
    churn_reason: row.churn_reason ?? null,
  };
}

interface AccountsContextType {
  accounts: Account[];
  loading: boolean;
  getAccount: (id: string) => Account | undefined;
  addAccount: (account: Partial<Account> & { name: string }) => Promise<Account | null>;
  updateAccount: (id: string, patch: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  refetch: () => void;
}

const AccountsContext = createContext<AccountsContextType | null>(null);

export interface AccountsQueryResult {
  rows: DbAccount[];
  stageChangedAt: Map<string, string>;
}

// Single source of truth for the accounts-list cache key. Anything that reads
// or warms this query (the provider below, AppSidebar's hover/idle prefetch)
// MUST use this helper + `fetchAccountsList` together so the cache entry always
// holds the same shape.
export const accountsListQueryKey = (orgId: string | undefined) =>
  ['accounts', orgId] as const;

/**
 * Fetches the accounts-list payload for an org. This is the ONLY allowed
 * producer for the `['accounts', orgId]` cache entry.
 *
 * Why this is extracted: AppSidebar used to prefetch `['accounts', orgId]` with
 * its own queryFn that returned a bare `DbAccount[]` array, while this provider
 * stores `{ rows, stageChangedAt }` and reads `.rows`. Hovering the Accounts nav
 * link fired the prefetch, clobbered the cache with the array shape, and left
 * `queryData?.rows` undefined → the list rendered "No accounts yet" in every
 * view until a hard reload repopulated the object shape. Sharing one fetcher
 * makes that divergence impossible.
 */
export async function fetchAccountsList(orgId: string): Promise<AccountsQueryResult> {
  // Accounts list payload: explicit columns (omit large free-text fields)
  // plus the sales columns.
  const { data, error } = await db
    .from('accounts')
    .select(
      [
        'id,organization_id,name,industry,segment,plan,arr,mrr,channels',
        'customer_since,pipeline_stage,region,trend,health_score',
        'tags,last_contact,code_prefix,created_at,updated_at',
        'founder_confidence,next_step_due,revenue_owner_id,delivery_owner_id',
        // Additional sales-row fields consumed by SalesMotionTab + SalApprovalModal.
        'qualification_checklist,next_step,next_step_task_id,expected_close_date,risk_notes,success_promise',
        'forecast_close_date',
        // Go-live fields + the usage timestamp that gates
        // pilot_running. Selecting them explicitly means the accounts list 400s
        // if the schema is behind the frontend, so apply the schema first.
        'golive_at,first_usage_at',
        'loss_reason_category,loss_reason_detail,lost_from_stage',
        'founder_approved_at,founder_approved_by,first_impact_at,source',
        // Customer-phase columns. The kanban card reads
        // pipeline_phase + customer_risk_reason directly; the pin fields drive
        // the lock icon and its tooltip.
        'pipeline_phase,customer_risk_reason,churn_reason',
        'customer_stage_pinned_at,customer_stage_pin_reason,reactivated_at',
        // Incumbent displacement. Small, and the pipeline card
        // and Sales motion tab both read them off the list payload.
        'incumbent_vendor,incumbent_last_renewal,incumbent_cycle,incumbent_evidence',
        'incumbent_source,incumbent_captured_at',
        'incumbent_window_snoozed_until,incumbent_window_disabled_reason',
      ].join(','),
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = (data || []) as unknown as DbAccount[];

  // Second query: derive each account's most recent lifecycle event so the
  // kanban can render days-in-stage without per-card N+1 lookups.
  const stageChangedAt = new Map<string, string>();
  const accountIds = rows.map((a) => a.id);
  if (accountIds.length > 0) {
    const { data: events } = await db
      .from('events')
      .select('account_id, created_at')
      .in('account_id', accountIds)
      .eq('group_label', 'lifecycle')
      .order('created_at', { ascending: false });
    for (const e of events ?? []) {
      if (e.account_id && !stageChangedAt.has(e.account_id)) {
        stageChangedAt.set(e.account_id, e.created_at);
      }
    }
  }

  return { rows, stageChangedAt };
}

export function AccountsProvider({ children }: { children: ReactNode }) {
  const orgCtx = useOrgContext();
  const orgId = orgCtx.orgId ?? undefined;
  const qc = useQueryClient();
  const accountsKey = accountsListQueryKey(orgId);

  const { data: queryData, isLoading, refetch } = useQuery<AccountsQueryResult>({
    queryKey: accountsKey,
    enabled: !!orgId,
    queryFn: () => fetchAccountsList(orgId!),
  });

  // `enabled: !!orgId` means a disabled query reports isLoading === false while
  // the profile is still in flight — and `rows` defaults to []. Every counter
  // built on this context would read a confident zero in that window.
  const loading = orgQueryLoading(orgCtx, { isLoading });

  const dbAccounts = queryData?.rows ?? [];
  const stageChangedAt = queryData?.stageChangedAt;

  const setCache = (updater: (prev: AccountsQueryResult) => AccountsQueryResult) => {
    qc.setQueryData<AccountsQueryResult>(accountsKey as unknown as readonly unknown[], (prev) => {
      const base: AccountsQueryResult = prev ?? { rows: [], stageChangedAt: new Map() };
      return updater(base);
    });
  };

  const accounts = useMemo(
    () => dbAccounts.map((row) => dbToLegacy(row, stageChangedAt?.get(row.id) ?? null)),
    [dbAccounts, stageChangedAt],
  );

  const accountsById = useMemo(() => {
    const m = new Map<string, Account>();
    accounts.forEach(a => m.set(a.id, a));
    return m;
  }, [accounts]);

  const getAccount = useCallback((id: string) => accountsById.get(id), [accountsById]);

  const addAccount = useCallback(async (account: Partial<Account> & { name: string }) => {
    if (!orgId) return null;
    // `transition_stage` derives pipeline_phase on every move, but it never runs
    // on the INSERT path — so mirror the derivation here. Without it a created
    // account has a stage but no phase, which hides the card's coverage chips
    // and drops it from the dashboard's sales counts.
    const stage = coercePipelineStage(account.lifecycleStage);
    const insert: TablesInsert<'accounts'> = {
      organization_id: orgId,
      name: account.name,
      industry: account.industry || null,
      segment: account.segment || null,
      plan: account.plan || null,
      arr: account.arr || 0,
      mrr: account.mrr || 0,
      channels: account.channels || [],
      customer_since: account.customerSince || null,
      // `lifecycleStage` is a free-form legacy string here; it MUST be coerced
      // to a valid `pipeline_stage` enum value or the entire insert is rejected
      // by Postgres (e.g. the old default 'Onboarding' is not a valid value).
      pipeline_stage: stage,
      pipeline_phase: phaseForStage(stage),
      region: account.region || null,
      trend: account.trend || 'flat',
      health_score: account.healthScore || 0,
      tags: account.tags || [],
    };
    const { data, error } = await db
      .from('accounts')
      .insert(insert)
      .select()
      .single();
    if (!error && data) {
      const inserted = data as DbAccount;
      setCache((prev) => ({
        ...prev,
        rows: [inserted, ...prev.rows],
      }));
      return dbToLegacy(inserted, null);
    }
    return null;
  }, [orgId, qc]);

  const updateAccount = useCallback(async (id: string, patch: Partial<Account>) => {
    const dbPatch: TablesUpdate<'accounts'> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.industry !== undefined) dbPatch.industry = patch.industry;
    if (patch.segment !== undefined) dbPatch.segment = patch.segment;
    if (patch.plan !== undefined) dbPatch.plan = patch.plan;
    if (patch.arr !== undefined) dbPatch.arr = patch.arr;
    if (patch.mrr !== undefined) dbPatch.mrr = patch.mrr;
    if (patch.channels !== undefined) dbPatch.channels = patch.channels;
    if (patch.customerSince !== undefined) dbPatch.customer_since = patch.customerSince;
    if (patch.lifecycleStage !== undefined) dbPatch.pipeline_stage = coercePipelineStage(patch.lifecycleStage);
    if (patch.region !== undefined) dbPatch.region = patch.region;
    if (patch.trend !== undefined) dbPatch.trend = patch.trend;
    if (patch.healthScore !== undefined) dbPatch.health_score = patch.healthScore;
    if (patch.tags !== undefined) dbPatch.tags = patch.tags;
    if (patch.lastContact !== undefined) dbPatch.last_contact = patch.lastContact;
    if (patch.mainIssue !== undefined) dbPatch.main_issue = patch.mainIssue;
    if (patch.codePrefix !== undefined) dbPatch.code_prefix = patch.codePrefix;
    // Sales-CRM fields, editable inline from SalesMotionTab. NOTE:
    // `pipeline_stage` is deliberately NOT mapped here — the DB trigger
    // `guard_accounts_pipeline_stage` rejects direct updates to that column.
    // Stage changes MUST go through `transitionStage()` (see
    // `src/lib/transitionStage.ts` / `useStageTransition`), never updateAccount.
    if (patch.expected_close_date !== undefined) dbPatch.expected_close_date = patch.expected_close_date;
    const forecastPatch = dbPatch as TablesUpdate<'accounts'> & ForecastColumns;
    if (patch.forecast_close_date !== undefined) forecastPatch.forecast_close_date = patch.forecast_close_date;
    // Go-live fields are read-only by construction: golive_at
    // is stamped by transition_stage, first_usage_at by the product usage
    // sync. The typed ones this block used to patch were dropped.
    if (patch.revenue_owner_id !== undefined) dbPatch.revenue_owner_id = patch.revenue_owner_id;
    if (patch.delivery_owner_id !== undefined) dbPatch.delivery_owner_id = patch.delivery_owner_id;
    if (patch.next_step !== undefined) dbPatch.next_step = patch.next_step;
    if (patch.next_step_due !== undefined) dbPatch.next_step_due = patch.next_step_due;
    if (patch.risk_notes !== undefined) dbPatch.risk_notes = patch.risk_notes;
    // Answered by a person on the Sales tab, or by the meeting agent.
    if (patch.qualification_checklist !== undefined) dbPatch.qualification_checklist = patch.qualification_checklist;
    if (patch.source !== undefined) dbPatch.source = patch.source;

    // Incumbent columns. Assigned through a widened alias because
    // `TablesUpdate<'accounts'>` will not carry them until the migrations are
    // applied and types are regenerated; the keys and value shapes are the ones
    // the migration creates. Remove the alias after the regen.
    const incumbentPatch = dbPatch as TablesUpdate<'accounts'> & IncumbentRow;
    for (const key of INCUMBENT_COLUMNS) {
      if (patch[key] !== undefined) {
        (incumbentPatch[key] as unknown) = patch[key];
      }
    }

    const { error } = await db.from('accounts').update(dbPatch).eq('id', id);
    if (error) {
      toast.error(error.message || 'Failed to update account');
      return;
    }
    setCache((prev) => ({
      ...prev,
      rows: prev.rows.map((a) => (a.id === id ? ({ ...a, ...dbPatch } as DbAccount) : a)),
    }));
  }, [orgId, qc]);

  const deleteAccount = useCallback(async (id: string) => {
    const { error } = await db.from('accounts').delete().eq('id', id);
    if (!error) {
      setCache((prev) => ({
        ...prev,
        rows: prev.rows.filter((a) => a.id !== id),
      }));
    }
  }, [orgId, qc]);

  const value = useMemo(
    () => ({ accounts, loading, getAccount, addAccount, updateAccount, deleteAccount, refetch }),
    [accounts, loading, getAccount, addAccount, updateAccount, deleteAccount, refetch]
  );

  return (
    <AccountsContext.Provider value={value}>
      {children}
    </AccountsContext.Provider>
  );
}

export function useAccounts() {
  const ctx = useContext(AccountsContext);
  if (!ctx) throw new Error('useAccounts must be used within AccountsProvider');
  return ctx;
}
