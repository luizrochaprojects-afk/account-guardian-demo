import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MultiSelectFilter, type MultiSelectOption } from "@/components/listing";
import { Flame, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DueDateBucket } from "@/lib/dateRanges";

/**
 * Vertical filter list rendered inside the draft `Filter` popover for Issues.
 * Mirrors the controls that live in the page toolbar in non-draft mode —
 * same setters, same options, just relocated.
 */
export interface FiltersIssuesSectionProps {
  statusOptions: MultiSelectOption[];
  priorityOptions: MultiSelectOption[];
  accountOptions: MultiSelectOption[];
  viewOptions: MultiSelectOption[];
  slaOptions: MultiSelectOption[];
  dueDateOptions: { value: DueDateBucket; label: string }[];

  statusFilter: string[];
  priorityFilter: string[];
  accountFilter: string[];
  viewFilter: string[];
  slaFilter: string[];
  hideCompleted: boolean;
  dueDateFilter: DueDateBucket;

  onStatusChange: (v: string[]) => void;
  onPriorityChange: (v: string[]) => void;
  onAccountChange: (v: string[]) => void;
  onViewChange: (v: string[]) => void;
  onSlaChange: (v: string[]) => void;
  onHideCompletedChange: (v: boolean) => void;
  onDueDateChange: (v: DueDateBucket) => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="flex-1 min-w-0 flex items-center gap-1 flex-wrap">{children}</div>
    </div>
  );
}

export function FiltersIssuesSection(p: FiltersIssuesSectionProps) {
  const slaAtRisk = p.slaFilter.includes("at_risk");
  const dueLabelFor = (v: string) => p.dueDateOptions.find(o => o.value === v)?.label || v;
  return (
    <div className="px-3 py-2 space-y-0.5">
      <Row label="Status">
        <MultiSelectFilter label="Status" options={p.statusOptions} selected={p.statusFilter} onChange={p.onStatusChange} />
      </Row>
      <Row label="Priority">
        <MultiSelectFilter label="Priority" options={p.priorityOptions} selected={p.priorityFilter} onChange={p.onPriorityChange} />
      </Row>
      <Row label="Account">
        <MultiSelectFilter label="Account" options={p.accountOptions} selected={p.accountFilter} onChange={p.onAccountChange} />
      </Row>
      <Row label="Type">
        <MultiSelectFilter label="Type" options={p.viewOptions} selected={p.viewFilter} onChange={p.onViewChange} searchable={false} />
      </Row>
      <Row label="Due">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-7 px-2 text-[11px] gap-1 border-dashed font-normal",
                p.dueDateFilter !== 'any' && "border-solid bg-accent/40",
              )}
            >
              {p.dueDateFilter === 'any' ? 'Due' : (
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground">Due:</span>
                  <span>{dueLabelFor(p.dueDateFilter)}</span>
                </span>
              )}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[160px] p-1">
            {p.dueDateOptions.map(o => (
              <button
                key={o.value}
                onClick={() => p.onDueDateChange(o.value)}
                className={cn(
                  "flex items-center w-full px-2 py-1 rounded-sm text-left text-[12px] transition-colors",
                  p.dueDateFilter === o.value ? "bg-accent" : "hover:bg-muted/50",
                )}
              >
                {o.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </Row>
      <Row label="SLA">
        <MultiSelectFilter label="SLA" options={p.slaOptions} selected={p.slaFilter} onChange={p.onSlaChange} />
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 text-[11px] border-dashed gap-1",
            slaAtRisk && "border-solid bg-accent text-destructive",
          )}
          onClick={() =>
            p.onSlaChange(slaAtRisk ? p.slaFilter.filter(v => v !== "at_risk") : [...p.slaFilter, "at_risk"])
          }
        >
          <Flame className="h-3.5 w-3.5" />
          At risk
        </Button>
      </Row>
      <Row label="Done">
        <Button
          variant="outline"
          size="sm"
          className={cn("h-7 text-[11px] border-dashed", p.hideCompleted && "border-solid bg-accent")}
          onClick={() => p.onHideCompletedChange(!p.hideCompleted)}
        >
          {p.hideCompleted ? "Show completed" : "Hide completed"}
        </Button>
      </Row>
    </div>
  );
}