import type { DbTask } from "@/hooks/useProjectsDB";
import type { Account } from "@/contexts/AccountsContext";
import { matchesTargetEnd, matchesDueDate, type DueDateBucket } from "@/lib/dateRanges";

export type ViewEntity = "issues" | "projects" | "accounts";

/* ── Issue (Tasks) filters ──────────────────────────────── */
export type IssueFilters = {
  status?: string[];      // [] = all
  priority?: string[];    // [] = all
  sla?: string[];         // [] = all; values: SlaStatus | 'at_risk'
  account?: string[];     // [] = all
  view?: string[];        // [] = all; values: 'parents_only' | 'sub_only'
  hideCompleted?: boolean;
  search?: string;
  /** Due-date bucket — overdue / today / tomorrow / this week / this month / no date. */
  dueDate?: DueDateBucket;
  /* ── Display options (don't count as "active filters") ── */
  grouping?: 'none' | 'status' | 'priority' | 'account' | 'project' | 'assignee';
  ordering?: 'updated' | 'created' | 'priority' | 'dueDate' | 'title';
  orderingDir?: 'asc' | 'desc';
  completed?: 'all' | 'hide' | 'only';
  showSubIssues?: boolean;
  displayProperties?: string[];
};

export const DEFAULT_ISSUE_FILTERS: Required<IssueFilters> = {
  status: [],
  priority: [],
  sla: [],
  account: [],
  view: [],
  hideCompleted: false,
  search: "",
  dueDate: 'any',
  grouping: 'none',
  ordering: 'updated',
  orderingDir: 'desc',
  completed: 'all',
  showSubIssues: true,
  displayProperties: ['status', 'priority', 'assignee', 'dueDate'],
};

/* ── Project filters ──────────────────────────────── */
export type ProjectFilters = {
  search?: string;
  depFilter?: string[]; // [] = all; values: 'has_deps' | 'has_blocking' | 'has_blocked_by'
  accountLinkFilter?: string[]; // [] = all; values: 'linked' | 'unlinked'
  status?: string[];        // ['on_track','at_risk','off_track','completed','paused']
  owner?: string[];         // user_ids; '__unassigned' for null owner
  category?: string[];      // category names
  targetEnd?: 'any' | 'overdue' | 'this_week' | 'this_month' | 'no_date';
  /* ── Display options ── */
  grouping?: 'none' | 'status' | 'account' | 'owner' | 'category';
  ordering?: 'updated' | 'name' | 'status' | 'targetEnd' | 'created';
  orderingDir?: 'asc' | 'desc';
  displayProperties?: string[];
};

export const DEFAULT_PROJECT_FILTERS: Required<ProjectFilters> = {
  search: "",
  depFilter: [],
  accountLinkFilter: [],
  status: [],
  owner: [],
  category: [],
  targetEnd: 'any',
  grouping: 'none',
  ordering: 'updated',
  orderingDir: 'desc',
  displayProperties: ['account', 'status', 'owner', 'targetEnd', 'updated'],
};

/* ── Account filters ──────────────────────────────── */
export type AccountFilters = {
  search?: string;
  health?: string[];        // ['healthy','concerning','poor','no_data']
  segment?: string[];
  /** user_ids; '__unassigned' matches a null owner. Same shape as ProjectFilters.owner. */
  revenueOwner?: string[];
  deliveryOwner?: string[];
  /**
   * "Accounts I'm on", either side. Stored as a flag rather than expanded into
   * the two arrays at save time, so a saved view named "My accounts" means
   * whoever is looking at it — not whoever created it.
   */
  myAccounts?: boolean;
  includeChurned?: boolean;
  sortBy?: string;          // 'name' | 'arr' | 'healthScore' | 'lastSeen'
  sortDir?: "asc" | "desc";
  groupBy?: string;
  visibleColumns?: string[];
  customProps?: Record<string, string[]>; // propertyId → selected option values
};

export const DEFAULT_ACCOUNT_FILTERS: Required<AccountFilters> = {
  search: "",
  health: [],
  segment: [],
  revenueOwner: [],
  deliveryOwner: [],
  myAccounts: false,
  includeChurned: false,
  sortBy: "healthScore",
  sortDir: "asc",
  groupBy: "none",
  visibleColumns: [],
  customProps: {},
};

export type AnyFilters = IssueFilters | ProjectFilters | AccountFilters;

/* ── Internal helper: legacy single-string → string[] ── */
function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter(x => typeof x === "string" && x !== "all");
  if (typeof v === "string" && v && v !== "all") return [v];
  return [];
}

/**
 * Normalize a saved filters object whose array fields may have been stored
 * as plain strings under the previous schema. Safe to call on already-new shapes.
 */
export function normalizeSavedFilters(entity: ViewEntity, raw: any): AnyFilters {
  if (!raw || typeof raw !== "object") return raw;
  if (entity === "issues") {
    // Legacy hideCompleted (bool) → completed: 'hide' | 'all'
    const completed: 'all' | 'hide' | 'only' =
      raw.completed === 'hide' || raw.completed === 'only' || raw.completed === 'all'
        ? raw.completed
        : (raw.hideCompleted ? 'hide' : 'all');
    return {
      status: toArray(raw.status),
      priority: toArray(raw.priority),
      sla: toArray(raw.sla),
      account: toArray(raw.account),
      view: toArray(raw.view),
      hideCompleted: !!raw.hideCompleted,
      search: typeof raw.search === "string" ? raw.search : "",
      dueDate: ['any','overdue','today','tomorrow','this_week','this_month','no_date'].includes(raw.dueDate) ? raw.dueDate : 'any',
      grouping: raw.grouping ?? 'none',
      ordering: raw.ordering ?? 'updated',
      orderingDir: raw.orderingDir === 'asc' ? 'asc' : 'desc',
      completed,
      showSubIssues: raw.showSubIssues !== false,
      displayProperties: Array.isArray(raw.displayProperties)
        ? raw.displayProperties
        : DEFAULT_ISSUE_FILTERS.displayProperties,
    } satisfies IssueFilters;
  }
  if (entity === "projects") {
    return {
      search: typeof raw.search === "string" ? raw.search : "",
      depFilter: toArray(raw.depFilter),
      accountLinkFilter: toArray(raw.accountLinkFilter),
      status: toArray(raw.status),
      owner: toArray(raw.owner),
      category: toArray(raw.category),
      targetEnd: ['any','overdue','this_week','this_month','no_date'].includes(raw.targetEnd) ? raw.targetEnd : 'any',
      grouping: raw.grouping ?? 'none',
      ordering: raw.ordering ?? 'updated',
      orderingDir: raw.orderingDir === 'asc' ? 'asc' : 'desc',
      displayProperties: Array.isArray(raw.displayProperties)
        ? raw.displayProperties
        : DEFAULT_PROJECT_FILTERS.displayProperties,
    } satisfies ProjectFilters;
  }
  // accounts already array-shaped; ensure customProps and the owner filters are
  // normalized. Views saved before the owner split carry neither owner key, and
  // AllAccounts feeds these straight into `new Set(...)` — an undefined there
  // throws and white-screens the view page.
  return {
    ...raw,
    revenueOwner: toArray(raw.revenueOwner),
    deliveryOwner: toArray(raw.deliveryOwner),
    myAccounts: !!raw.myAccounts,
    customProps: raw.customProps ?? {},
  } as AccountFilters;
}

/* ── URL <-> filters ──────────────────────────────── */

export function parseFiltersFromSearchParams(
  entity: ViewEntity,
  sp: URLSearchParams,
): AnyFilters {
  if (entity === "issues") {
    const f: IssueFilters = {};
    if (sp.has("status")) f.status = (sp.get("status") || "").split(",").filter(Boolean);
    if (sp.has("priority")) f.priority = (sp.get("priority") || "").split(",").filter(Boolean);
    if (sp.has("sla")) f.sla = (sp.get("sla") || "").split(",").filter(Boolean);
    if (sp.has("account")) f.account = (sp.get("account") || "").split(",").filter(Boolean);
    if (sp.has("view")) f.view = (sp.get("view") || "").split(",").filter(Boolean);
    if (sp.has("hideCompleted")) f.hideCompleted = sp.get("hideCompleted") === "1";
    if (sp.has("q")) f.search = sp.get("q") || "";
    if (sp.has("due")) f.dueDate = sp.get("due") as IssueFilters['dueDate'];
    if (sp.has("group")) f.grouping = sp.get("group") as IssueFilters['grouping'];
    if (sp.has("order")) f.ordering = sp.get("order") as IssueFilters['ordering'];
    if (sp.has("orderDir")) f.orderingDir = (sp.get("orderDir") === 'asc' ? 'asc' : 'desc');
    if (sp.has("done")) f.completed = sp.get("done") as IssueFilters['completed'];
    if (sp.has("subs")) f.showSubIssues = sp.get("subs") === "1";
    if (sp.has("props")) f.displayProperties = (sp.get("props") || "").split(",").filter(Boolean);
    return f;
  }
  if (entity === "projects") {
    const f: ProjectFilters = {};
    if (sp.has("q")) f.search = sp.get("q") || "";
    if (sp.has("dep")) f.depFilter = (sp.get("dep") || "").split(",").filter(Boolean);
    if (sp.has("acct")) f.accountLinkFilter = (sp.get("acct") || "").split(",").filter(Boolean);
    if (sp.has("pstatus")) f.status = (sp.get("pstatus") || "").split(",").filter(Boolean);
    if (sp.has("owner")) f.owner = (sp.get("owner") || "").split(",").filter(Boolean);
    if (sp.has("cat")) f.category = (sp.get("cat") || "").split(",").filter(Boolean);
    if (sp.has("tend")) f.targetEnd = sp.get("tend") as ProjectFilters['targetEnd'];
    if (sp.has("group")) f.grouping = sp.get("group") as ProjectFilters['grouping'];
    if (sp.has("order")) f.ordering = sp.get("order") as ProjectFilters['ordering'];
    if (sp.has("orderDir")) f.orderingDir = (sp.get("orderDir") === 'asc' ? 'asc' : 'desc');
    if (sp.has("props")) f.displayProperties = (sp.get("props") || "").split(",").filter(Boolean);
    return f;
  }
  // accounts
  const f: AccountFilters = {};
  if (sp.has("q")) f.search = sp.get("q") || "";
  if (sp.has("health")) f.health = (sp.get("health") || "").split(",").filter(Boolean);
  if (sp.has("segment")) f.segment = (sp.get("segment") || "").split(",").filter(Boolean);
  if (sp.has("rown")) f.revenueOwner = (sp.get("rown") || "").split(",").filter(Boolean);
  if (sp.has("down")) f.deliveryOwner = (sp.get("down") || "").split(",").filter(Boolean);
  if (sp.has("mine")) f.myAccounts = sp.get("mine") === "1";
  if (sp.has("churned")) f.includeChurned = sp.get("churned") === "1";
  if (sp.has("sort")) f.sortBy = sp.get("sort") || "healthScore";
  if (sp.has("dir")) {
    const d = sp.get("dir");
    if (d === "asc" || d === "desc") f.sortDir = d;
  }
  if (sp.has("group")) f.groupBy = sp.get("group") || "none";
  if (sp.has("cols")) f.visibleColumns = (sp.get("cols") || "").split(",").filter(Boolean);
  const customProps: Record<string, string[]> = {};
  sp.forEach((value, key) => {
    if (key.startsWith("cp_")) {
      const propId = key.slice(3);
      const vals = value.split(",").filter(Boolean);
      if (vals.length) customProps[propId] = vals;
    }
  });
  if (Object.keys(customProps).length) f.customProps = customProps;
  return f;
}

export function applyFiltersToSearchParams(
  entity: ViewEntity,
  sp: URLSearchParams,
  filters: AnyFilters,
): URLSearchParams {
  const next = new URLSearchParams(sp);
  // Preserve metadata params that are not filters: `view` (saved view id),
  // `edit`, and `draft`. These are managed by ViewDetail / SaveViewButton
  // and must survive a filter-state → URL sync, otherwise pages would
  // strip the saved-view context from the URL on every state change.
  // Note: issue filters also use a `view` key (parents_only / sub_only) —
  // we only treat the `view` param as metadata when its value looks like a
  // UUID, never as a filter value.
  const preservedView = next.get("view");
  const isViewIdLike = !!preservedView && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(preservedView);
  const preservedEdit = next.get("edit");
  const preservedDraft = next.get("draft");
  // strip all filter keys (including dynamic cp_<uuid> custom property filters)
  ["status", "priority", "sla", "account", "view", "hideCompleted", "q",
    "dep", "acct", "health", "segment", "rown", "down", "mine", "churned", "sort", "dir", "group", "cols",
    "order", "orderDir", "done", "subs", "props", "due",
    "pstatus", "owner", "cat", "tend"].forEach(k => next.delete(k));
  Array.from(next.keys()).filter(k => k.startsWith("cp_")).forEach(k => next.delete(k));

  if (entity === "issues") {
    const f = filters as IssueFilters;
    if (f.status?.length) next.set("status", f.status.join(","));
    if (f.priority?.length) next.set("priority", f.priority.join(","));
    if (f.sla?.length) next.set("sla", f.sla.join(","));
    if (f.account?.length) next.set("account", f.account.join(","));
    if (f.view?.length) next.set("view", f.view.join(","));
    if (f.hideCompleted) next.set("hideCompleted", "1");
    if (f.search) next.set("q", f.search);
    if (f.dueDate && f.dueDate !== 'any') next.set("due", f.dueDate);
    if (f.grouping && f.grouping !== 'none') next.set("group", f.grouping);
    if (f.ordering && f.ordering !== 'updated') next.set("order", f.ordering);
    if (f.orderingDir && f.orderingDir !== 'desc') next.set("orderDir", f.orderingDir);
    if (f.completed && f.completed !== 'all') next.set("done", f.completed);
    if (f.showSubIssues === false) next.set("subs", "0");
    if (f.displayProperties && f.displayProperties.length) next.set("props", f.displayProperties.join(","));
  } else if (entity === "projects") {
    const f = filters as ProjectFilters;
    if (f.search) next.set("q", f.search);
    if (f.depFilter?.length) next.set("dep", f.depFilter.join(","));
    if (f.accountLinkFilter?.length) next.set("acct", f.accountLinkFilter.join(","));
    if (f.status?.length) next.set("pstatus", f.status.join(","));
    if (f.owner?.length) next.set("owner", f.owner.join(","));
    if (f.category?.length) next.set("cat", f.category.join(","));
    if (f.targetEnd && f.targetEnd !== 'any') next.set("tend", f.targetEnd);
    if (f.grouping && f.grouping !== 'none') next.set("group", f.grouping);
    if (f.ordering && f.ordering !== 'updated') next.set("order", f.ordering);
    if (f.orderingDir && f.orderingDir !== 'desc') next.set("orderDir", f.orderingDir);
    if (f.displayProperties && f.displayProperties.length) next.set("props", f.displayProperties.join(","));
  } else {
    const f = filters as AccountFilters;
    if (f.search) next.set("q", f.search);
    if (f.health && f.health.length) next.set("health", f.health.join(","));
    if (f.segment && f.segment.length) next.set("segment", f.segment.join(","));
    if (f.revenueOwner && f.revenueOwner.length) next.set("rown", f.revenueOwner.join(","));
    if (f.deliveryOwner && f.deliveryOwner.length) next.set("down", f.deliveryOwner.join(","));
    if (f.myAccounts) next.set("mine", "1");
    if (f.includeChurned) next.set("churned", "1");
    if (f.sortBy && f.sortBy !== "healthScore") next.set("sort", f.sortBy);
    if (f.sortDir && f.sortDir !== "asc") next.set("dir", f.sortDir);
    if (f.groupBy && f.groupBy !== "none") next.set("group", f.groupBy);
    if (f.visibleColumns && f.visibleColumns.length) next.set("cols", f.visibleColumns.join(","));
    if (f.customProps) {
      for (const [propId, vals] of Object.entries(f.customProps)) {
        if (vals.length) next.set(`cp_${propId}`, vals.join(","));
      }
    }
  }
  // Re-apply preserved metadata params last so they survive the strip
  // pass above. The UUID check ensures we don't accidentally re-introduce
  // an issue-filter `view=parents_only` value as if it were a saved view id.
  if (isViewIdLike && preservedView) next.set("view", preservedView);
  if (preservedEdit) next.set("edit", preservedEdit);
  if (preservedDraft) next.set("draft", preservedDraft);
  return next;
}

export function hasActiveFilters(entity: ViewEntity, filters: AnyFilters): boolean {
  if (entity === "issues") {
    const f = filters as IssueFilters;
    return Boolean(
      f.status?.length ||
      f.priority?.length ||
      f.sla?.length ||
      f.account?.length ||
      f.view?.length ||
      f.hideCompleted ||
      (f.dueDate && f.dueDate !== 'any') ||
      (f.search && f.search.trim()),
    );
  }
  if (entity === "projects") {
    const f = filters as ProjectFilters;
    return Boolean(
      (f.search && f.search.trim()) ||
      f.depFilter?.length ||
      f.accountLinkFilter?.length ||
      f.status?.length ||
      f.owner?.length ||
      f.category?.length ||
      (f.targetEnd && f.targetEnd !== 'any'),
    );
  }
  const f = filters as AccountFilters;
  return Boolean(
    (f.search && f.search.trim()) ||
    (f.health && f.health.length) ||
    (f.segment && f.segment.length) ||
    (f.revenueOwner && f.revenueOwner.length) ||
    (f.deliveryOwner && f.deliveryOwner.length) ||
    f.myAccounts ||
    f.includeChurned ||
    (f.groupBy && f.groupBy !== "none") ||
    (f.sortBy && f.sortBy !== "healthScore") ||
    (f.sortDir && f.sortDir !== "asc") ||
    Object.values(f.customProps ?? {}).some(v => v.length > 0),
  );
}

/* ── Filter functions used by Views index for live counts ── */

export function applyIssueFilters(tasks: DbTask[], filters: IssueFilters): DbTask[] {
  const f = { ...DEFAULT_ISSUE_FILTERS, ...filters };
  const q = f.search.trim().toLowerCase();
  return tasks.filter(t => {
    if (f.status.length && !f.status.includes(t.status)) return false;
    if (f.priority.length && !f.priority.includes(t.priority || "no_priority")) return false;
    if (f.account.length && !f.account.includes(t.account_id || "")) return false;
    if (f.view.includes("parents_only") && t.parent_id) return false;
    if (f.view.includes("sub_only") && !t.parent_id) return false;
    if (f.hideCompleted && (t.status === "done" || t.status === "cancelled")) return false;
    if (f.dueDate && f.dueDate !== 'any' && !matchesDueDate((t as any).due_date ?? null, f.dueDate)) return false;
    if (q) {
      const hay = `${t.name || ""} ${t.code || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    // SLA filter is too coupled to runtime SLA evaluation — approximate:
    // we skip filtering by SLA in the count and treat it as "matches".
    return true;
  });
}

export function applyProjectFilters<T extends { name: string; code?: string | null; category?: string | null; account_id: string | null; status?: string; owner?: string | null; target_end_at?: string | null }>(
  projects: T[],
  accountMap: Record<string, string>,
  filters: ProjectFilters,
): T[] {
  const f = { ...DEFAULT_PROJECT_FILTERS, ...filters };
  const q = f.search.trim().toLowerCase();
  return projects.filter(p => {
    if (q) {
      const hay = `${p.name} ${p.code || ""} ${p.category || ""} ${(p.account_id ? accountMap[p.account_id] : "") || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.status.length && !f.status.includes(p.status || "")) return false;
    if (f.owner.length) {
      const own = p.owner || '__unassigned';
      if (!f.owner.includes(own)) return false;
    }
    if (f.category.length && !f.category.includes(p.category || "")) return false;
    if (!matchesTargetEnd(p.target_end_at ?? null, f.targetEnd)) return false;
    // depFilter requires dep counts; skip in summary count (treat as match).
    return true;
  });
}

/**
 * The owner half of the account filter, on its own.
 *
 * Accounts are filtered in three places — the table memo and the pipeline-board
 * memo in AllAccounts, and `applyAccountFilters` below (export + the Views
 * index counts). Three copies of this predicate would drift, and the symptom
 * would read as "the owner filter doesn't work on the board".
 *
 * `currentUserId` is optional and `myAccounts` is a no-op without it: an export
 * fired from a context with no resolved profile must not silently return zero
 * rows.
 */
export function matchesOwnerFilters(
  account: Pick<Account, 'revenue_owner_id' | 'delivery_owner_id'>,
  filters: Pick<AccountFilters, 'revenueOwner' | 'deliveryOwner' | 'myAccounts'>,
  currentUserId?: string | null,
): boolean {
  const matchOne = (selected: string[] | undefined, value: string | null) => {
    if (!selected?.length) return true;
    return value === null
      ? selected.includes('__unassigned')
      : selected.includes(value);
  };
  if (!matchOne(filters.revenueOwner, account.revenue_owner_id)) return false;
  if (!matchOne(filters.deliveryOwner, account.delivery_owner_id)) return false;
  if (filters.myAccounts && currentUserId) {
    if (account.revenue_owner_id !== currentUserId && account.delivery_owner_id !== currentUserId) {
      return false;
    }
  }
  return true;
}

export function applyAccountFilters(
  accounts: Account[],
  filters: AccountFilters,
  currentUserId?: string | null,
): Account[] {
  const f = { ...DEFAULT_ACCOUNT_FILTERS, ...filters };
  const q = f.search.trim().toLowerCase();
  return accounts.filter(a => {
    if (!matchesOwnerFilters(a, f, currentUserId)) return false;
    // 'churned' is the `pipeline_stage` enum value. This compared against the
    // capitalised legacy label until 2026-08, so the filter never excluded
    // anything — "Include churned: off" quietly showed churned accounts.
    if (!f.includeChurned && a.lifecycleStage === "churned") return false;
    if (q && !a.name.toLowerCase().includes(q)) return false;
    if (f.segment.length && !f.segment.includes(a.segment)) return false;
    if (f.health.length) {
      const hasData = a.healthScore > 0;
      const status = !hasData ? "no_data" : a.healthScore >= 70 ? "healthy" : a.healthScore >= 40 ? "concerning" : "poor";
      if (!f.health.includes(status)) return false;
    }
    return true;
  });
}

/* ── Human-readable filter summary ── */

export function summarizeFilters(entity: ViewEntity, filters: AnyFilters, accountMap?: Record<string, string>): string {
  const parts: string[] = [];
  if (entity === "issues") {
    const f = filters as IssueFilters;
    if (f.status?.length) parts.push(`status: ${f.status.join(", ")}`);
    if (f.priority?.length) parts.push(`priority: ${f.priority.join(", ")}`);
    if (f.sla?.length) parts.push(`SLA: ${f.sla.join(", ")}`);
    if (f.account?.length) parts.push(`account: ${f.account.map(id => accountMap?.[id] || id).join(", ")}`);
    if (f.view?.length) parts.push(`view: ${f.view.join(", ")}`);
    if (f.hideCompleted) parts.push("hide completed");
    if (f.dueDate && f.dueDate !== 'any') parts.push(`due: ${f.dueDate.replace('_', ' ')}`);
    if (f.search) parts.push(`"${f.search}"`);
  } else if (entity === "projects") {
    const f = filters as ProjectFilters;
    if (f.search) parts.push(`"${f.search}"`);
    if (f.status?.length) parts.push(`status: ${f.status.join(", ")}`);
    if (f.owner?.length) parts.push(`owner: ${f.owner.length}`);
    if (f.category?.length) parts.push(`category: ${f.category.join(", ")}`);
    if (f.targetEnd && f.targetEnd !== 'any') parts.push(`target: ${f.targetEnd.replace('_', ' ')}`);
    if (f.depFilter?.length) parts.push(`deps: ${f.depFilter.join(", ")}`);
  } else {
    const f = filters as AccountFilters;
    if (f.search) parts.push(`"${f.search}"`);
    if (f.health?.length) parts.push(`health: ${f.health.join(", ")}`);
    if (f.segment?.length) parts.push(`segment: ${f.segment.join(", ")}`);
    if (f.revenueOwner?.length) parts.push(`revenue owner: ${f.revenueOwner.length}`);
    if (f.deliveryOwner?.length) parts.push(`delivery owner: ${f.deliveryOwner.length}`);
    if (f.myAccounts) parts.push("my accounts");
    if (f.includeChurned) parts.push("incl. churned");
    if (f.groupBy && f.groupBy !== "none") parts.push(`grouped by ${f.groupBy}`);
  }
  return parts.join(" · ") || "no filters";
}