import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { useTasksDB } from "@/hooks/useProjectsDB";
import { useProjectsDB } from "@/hooks/useProjectsDB";
import { useAccounts } from "@/contexts/AccountsContext";
import {
  applyIssueFilters,
  applyProjectFilters,
  applyAccountFilters,
  type AnyFilters,
  type IssueFilters,
  type ProjectFilters,
  type AccountFilters,
  type ViewEntity,
} from "@/lib/viewFilters";
import { buildCsv, downloadCsv, slugifyForFilename } from "@/lib/csvExport";
import { CUSTOMER_COLUMNS, CUSTOMER_COLUMN_KEYS } from "@/lib/customerColumns";
import { useCustomerSignals } from "@/hooks/useCustomerSignals";
import { useOrgSettings } from "@/hooks/useOrgSettings";
import { useOrgMembers } from "@/hooks/useOrgMembers";

interface ExportViewButtonProps {
  entity: ViewEntity;
  filters: AnyFilters;
  viewName: string;
}

const ISSUE_COLUMNS = [
  "code", "name", "status", "priority", "assigned_role", "assign_to",
  "account", "due_date", "due_label", "category", "tags",
  "sla_deadline", "is_done", "created_at", "updated_at",
];
const PROJECT_COLUMNS = [
  "code", "name", "status", "category", "owner", "account",
  "started_at", "target_end_at", "created_at", "updated_at",
];
const ACCOUNT_COLUMNS = [
  "name", "segment", "industry", "plan", "lifecycleStage", "region",
  "revenueOwner", "deliveryOwner", "healthScore", "trend",
  "arr", "mrr", "tags", "channels", "customerSince", "lastContact",
  "createdAt", "updatedAt",
  // Customer-phase columns. Keys match the registry in
  // src/lib/customerColumns.ts; the values are attached per row below.
  ...CUSTOMER_COLUMN_KEYS,
];

/**
 * "Export view" action: applies the saved view's filters to the current
 * data set and downloads the result as CSV. Lives on /views/:id only.
 */
export function ExportViewButton({ entity, filters, viewName }: ExportViewButtonProps) {
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const [busy, setBusy] = useState(false);

  const { tasks } = useTasksDB(undefined, entity === "issues" ? orgId : undefined);
  const { projects } = useProjectsDB();
  const { accounts } = useAccounts();
  const { members: orgMembers } = useOrgMembers();
  const { byAccount: signalsByAccount } = useCustomerSignals();
  const { currencySymbol } = useOrgSettings();

  // Owner columns export the display name, never the uuid — a CSV of uuids
  // answers nothing.
  const memberNames = useMemo(() => {
    const m = new Map<string, string>();
    orgMembers.forEach((x) => m.set(x.user_id, x.display_name || "Unnamed"));
    return m;
  }, [orgMembers]);

  const accountMap = useMemo(() => {
    const m: Record<string, string> = {};
    accounts.forEach(a => { m[a.id] = a.name; });
    return m;
  }, [accounts]);

  const handleExport = () => {
    try {
      setBusy(true);
      let rows: Array<Record<string, unknown>> = [];
      let columns: string[] = [];

      if (entity === "issues") {
        const filtered = applyIssueFilters(tasks ?? [], filters as IssueFilters);
        columns = ISSUE_COLUMNS;
        rows = filtered.map(t => ({
          ...t,
          account: t.account_id ? (accountMap[t.account_id] || t.account_id) : "",
        }));
      } else if (entity === "projects") {
        const filtered = applyProjectFilters(projects ?? [], accountMap, filters as ProjectFilters);
        columns = PROJECT_COLUMNS;
        rows = filtered.map(p => ({
          ...p,
          account: p.account_id ? (accountMap[p.account_id] || p.account_id) : "",
        }));
      } else {
        const filtered = applyAccountFilters(accounts ?? [], filters as AccountFilters, profile?.user_id);
        columns = ACCOUNT_COLUMNS;
        // Customer columns live on the signals view, not on the account row, so
        // they are attached here. Export uses the same formatters as the table:
        // a CSV that disagrees with the screen it was exported from is worse
        // than no CSV. Blanks stay blank — '—' is a screen affordance.
        rows = filtered.map((a) => {
          const ctx = {
            signals: signalsByAccount.get(a.id),
            churnReason: a.churn_reason ?? null,
            symbol: currencySymbol,
            fxRate: null,
          };
          const extras: Record<string, unknown> = {};
          for (const c of CUSTOMER_COLUMNS) extras[c.key] = c.format(ctx) ?? "";
          extras.revenueOwner = a.revenue_owner_id ? memberNames.get(a.revenue_owner_id) ?? "" : "";
          extras.deliveryOwner = a.delivery_owner_id ? memberNames.get(a.delivery_owner_id) ?? "" : "";
          return { ...a, ...extras } as unknown as Record<string, unknown>;
        });
      }

      if (!rows.length) {
        toast.info("No results to export");
        return;
      }

      const csv = buildCsv(rows, columns);
      const date = new Date().toISOString().slice(0, 10);
      downloadCsv(`${slugifyForFilename(viewName)}-${date}.csv`, csv);
      toast.success(`Exported ${rows.length} ${rows.length === 1 ? "row" : "rows"}`);
    } catch (err) {
      console.error("Export view failed", err);
      toast.error("Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 w-8 p-0"
      onClick={handleExport}
      disabled={busy}
      title="Export view — download filtered results as CSV"
      aria-label="Export view"
    >
      <Download className="h-3.5 w-3.5" />
    </Button>
  );
}