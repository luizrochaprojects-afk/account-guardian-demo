import { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlidersHorizontal, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnyFilters, IssueFilters, ProjectFilters, AccountFilters, ViewEntity } from "@/lib/viewFilters";
import { CUSTOMER_COLUMNS } from "@/lib/customerColumns";

/* ── Per-entity option catalogs ──────────────────────────────── */

const ISSUE_GROUPING = [
  { value: 'none', label: 'No grouping' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'account', label: 'Account' },
  { value: 'project', label: 'Project' },
  { value: 'assignee', label: 'Assignee' },
] as const;

const ISSUE_ORDERING = [
  { value: 'updated', label: 'Updated' },
  { value: 'created', label: 'Created' },
  { value: 'priority', label: 'Priority' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'title', label: 'Title' },
] as const;

const ISSUE_COMPLETED = [
  { value: 'all', label: 'All' },
  { value: 'hide', label: 'Hide' },
  { value: 'only', label: 'Only' },
] as const;

// Only properties that have actual columns in the issue list. Adding entries
// here without wiring the corresponding cell in `Tasks.tsx` would surface a
// chip that toggles silently.
const ISSUE_PROPERTIES = [
  { value: 'project', label: 'Project' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'priority', label: 'Priority' },
  { value: 'sla', label: 'SLA' },
  { value: 'dueDate', label: 'Due date' },
] as const;

const PROJECT_GROUPING = [
  { value: 'none', label: 'No grouping' },
  { value: 'status', label: 'Status' },
  { value: 'account', label: 'Account' },
  { value: 'owner', label: 'Owner' },
  { value: 'category', label: 'Category' },
] as const;

const PROJECT_ORDERING = [
  { value: 'updated', label: 'Updated' },
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'targetEnd', label: 'Target end' },
  { value: 'created', label: 'Created' },
] as const;

const PROJECT_PROPERTIES = [
  { value: 'account', label: 'Account' },
  { value: 'status', label: 'Status' },
  { value: 'owner', label: 'Owner' },
  { value: 'category', label: 'Category' },
  { value: 'targetEnd', label: 'Target end' },
  { value: 'started', label: 'Started' },
  { value: 'updated', label: 'Updated' },
  { value: 'created', label: 'Created' },
  { value: 'code', label: 'Code' },
  { value: 'deps', label: 'Deps' },
] as const;

const ACCOUNT_GROUPING = [
  { value: 'none', label: 'No grouping' },
  { value: 'healthStatus', label: 'Health' },
  { value: 'segment', label: 'Segment' },
  { value: 'lifecycleStage', label: 'Lifecycle' },
  { value: 'plan', label: 'Plan' },
  { value: 'region', label: 'Region' },
  { value: 'revenueOwner', label: 'Revenue owner' },
  { value: 'deliveryOwner', label: 'Delivery owner' },
] as const;

const ACCOUNT_ORDERING = [
  { value: 'name', label: 'Name' },
  { value: 'arr', label: 'Potential ARR' },
  { value: 'healthScore', label: 'Health' },
  { value: 'lastSeen', label: 'Last seen' },
] as const;

const ACCOUNT_PROPERTIES: readonly { value: string; label: string }[] = [
  { value: 'segment', label: 'Segment' },
  { value: 'health', label: 'Health' },
  { value: 'arr', label: 'Potential ARR' },
  { value: 'lastSeen', label: 'Last Seen' },
  { value: 'lastInteraction', label: 'Last Interaction' },
  // The two owner columns. Off by default: a stored visible
  // set overrides the defaults anyway, so shipping them on would only change
  // the table for people who never touched the column chooser.
  { value: 'revenueOwner', label: 'Revenue owner' },
  { value: 'deliveryOwner', label: 'Delivery owner' },
  // Customer-phase columns, off by default — see customerColumns.ts.
  ...CUSTOMER_COLUMNS.map((c) => ({ value: c.key, label: c.label })),
];

/* ── Section primitive ──────────────────────────────── */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 min-h-7">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex items-center rounded-sm border bg-background p-0.5">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "h-5 px-2 text-[11px] rounded-[3px] transition-colors",
            value === o.value
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PropertyChips({
  options, selected, onChange,
}: {
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const sel = new Set(selected);
  const toggle = (v: string) => {
    if (sel.has(v)) onChange(selected.filter(x => x !== v));
    else onChange([...selected, v]);
  };
  return (
    <div className="flex flex-wrap gap-1 pt-1">
      {options.map(o => {
        const active = sel.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={cn(
              "h-5 px-1.5 text-[11px] rounded-sm border transition-colors",
              active
                ? "bg-accent border-accent text-foreground"
                : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Main popover ──────────────────────────────── */

export interface DisplayOptionsPopoverProps {
  entity: ViewEntity;
  value: AnyFilters;
  onChange: (patch: Partial<AnyFilters>) => void;
  /** @deprecated kept for backward compat — no longer rendered in the trigger button. */
  triggerLabel?: string;
  hasActiveState?: boolean;
  className?: string;
}

export function DisplayOptionsPopover({
  entity, value, onChange, hasActiveState, className,
}: DisplayOptionsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-7 w-7 p-0 relative", className)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {hasActiveState && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 border border-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] p-0">
        <div className="px-3 py-2 border-b">
          <p className="text-[11px] font-medium">Display</p>
        </div>
        <div className="px-3 py-2 space-y-0.5">
          {entity === "issues" && <IssueDisplay value={value as IssueFilters} onChange={onChange} />}
          {entity === "projects" && <ProjectDisplay value={value as ProjectFilters} onChange={onChange} />}
          {entity === "accounts" && <AccountDisplay value={value as AccountFilters} onChange={onChange} />}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Entity sub-views ──────────────────────────────── */

function OrderingRow<T extends string>({
  value, dir, options, onChange,
}: {
  value: T; dir: 'asc' | 'desc';
  options: readonly { value: T; label: string }[];
  onChange: (patch: { ordering?: T; orderingDir?: 'asc' | 'desc' }) => void;
}) {
  return (
    <Section label="Ordering">
      <Select value={value} onValueChange={(v) => onChange({ ordering: v as T })}>
        <SelectTrigger className="h-6 text-[11px] px-1.5 gap-1 w-auto min-w-0 [&>svg]:h-3 [&>svg]:w-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={() => onChange({ orderingDir: dir === 'asc' ? 'desc' : 'asc' })}
        title={dir === 'asc' ? 'Ascending' : 'Descending'}
      >
        {dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      </Button>
    </Section>
  );
}

function GroupingRow<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <Section label="Grouping">
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="h-6 text-[11px] px-1.5 gap-1 w-auto min-w-0 [&>svg]:h-3 [&>svg]:w-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </Section>
  );
}

function IssueDisplay({ value, onChange }: { value: IssueFilters; onChange: (p: Partial<IssueFilters>) => void }) {
  const grouping = value.grouping ?? 'none';
  const ordering = value.ordering ?? 'updated';
  const orderingDir = value.orderingDir ?? 'desc';
  const completed = value.completed ?? (value.hideCompleted ? 'hide' : 'all');
  const showSubs = value.showSubIssues !== false;
  const props = value.displayProperties ?? ['status', 'priority', 'assignee', 'dueDate'];

  return (
    <>
      <GroupingRow value={grouping} options={ISSUE_GROUPING} onChange={v => onChange({ grouping: v })} />
      <OrderingRow
        value={ordering}
        dir={orderingDir}
        options={ISSUE_ORDERING}
        onChange={p => onChange(p as Partial<IssueFilters>)}
      />
      <Section label="Completed issues">
        <Segmented value={completed} options={ISSUE_COMPLETED} onChange={v => onChange({ completed: v, hideCompleted: v === 'hide' })} />
      </Section>
      <Section label="Show sub-issues">
        <Switch checked={showSubs} onCheckedChange={c => onChange({ showSubIssues: c })} />
      </Section>
      <div className="pt-2 border-t mt-1">
        <p className="text-[11px] text-muted-foreground mb-0.5">Display properties</p>
        <PropertyChips
          options={ISSUE_PROPERTIES}
          selected={props}
          onChange={v => onChange({ displayProperties: v })}
        />
      </div>
    </>
  );
}

function ProjectDisplay({ value, onChange }: { value: ProjectFilters; onChange: (p: Partial<ProjectFilters>) => void }) {
  const grouping = value.grouping ?? 'none';
  const ordering = value.ordering ?? 'updated';
  const orderingDir = value.orderingDir ?? 'desc';
  const props = value.displayProperties ?? ['account', 'status', 'owner', 'targetEnd', 'updated'];
  return (
    <>
      <GroupingRow value={grouping} options={PROJECT_GROUPING} onChange={v => onChange({ grouping: v })} />
      <OrderingRow
        value={ordering}
        dir={orderingDir}
        options={PROJECT_ORDERING}
        onChange={p => onChange(p as Partial<ProjectFilters>)}
      />
      <div className="pt-2 border-t mt-1">
        <p className="text-[11px] text-muted-foreground mb-0.5">Display properties</p>
        <p className="text-[10px] text-muted-foreground/70 mb-1">Name is always shown.</p>
        <PropertyChips
          options={PROJECT_PROPERTIES}
          selected={props}
          onChange={v => onChange({ displayProperties: v })}
        />
      </div>
    </>
  );
}

function AccountDisplay({ value, onChange }: { value: AccountFilters; onChange: (p: Partial<AccountFilters>) => void }) {
  const groupBy = value.groupBy ?? 'none';
  const sortBy = value.sortBy ?? 'healthScore';
  const sortDir = value.sortDir ?? 'asc';
  // Default-visible set. Customer columns are deliberately absent: they are
  // opt-in.
  const cols = value.visibleColumns ?? ['segment', 'health', 'arr', 'lastSeen', 'lastInteraction'];
  return (
    <>
      <Section label="Grouping">
        <Select value={groupBy} onValueChange={(v) => onChange({ groupBy: v })}>
          <SelectTrigger className="h-6 text-[11px] px-1.5 gap-1 w-auto min-w-0 [&>svg]:h-3 [&>svg]:w-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_GROUPING.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Section>
      <Section label="Ordering">
        <Select value={sortBy} onValueChange={(v) => onChange({ sortBy: v })}>
          <SelectTrigger className="h-6 text-[11px] px-1.5 gap-1 w-auto min-w-0 [&>svg]:h-3 [&>svg]:w-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_ORDERING.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => onChange({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })}
          title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
        >
          {sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        </Button>
      </Section>
      <div className="pt-2 border-t mt-1">
        <p className="text-[11px] text-muted-foreground mb-0.5">Display properties</p>
        <PropertyChips
          options={ACCOUNT_PROPERTIES}
          selected={cols}
          onChange={v => onChange({ visibleColumns: v })}
        />
      </div>
    </>
  );
}