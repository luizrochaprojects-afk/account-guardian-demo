import { Flame, Check, X, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  getSlaStatus,
  matchSlaRule,
  SLA_STATUS_LABELS,
  formatDuration,
  type SlaStatus,
} from "@/lib/slaUtils";
import type { SlaRule } from "@/hooks/useSlaRulesDB";

interface SlaDetailCardProps {
  task: {
    sla_deadline?: string | null;
    sla_started_at?: string | null;
    sla_duration_hours?: number | null;
    priority?: string | null;
    is_done?: boolean;
    status?: string;
    updated_at?: string;
  };
  slaRules: SlaRule[];
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function formatDelta(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < 60_000) return "<1m";
  if (abs < HOUR) return `${Math.floor(abs / 60_000)}m`;
  if (abs < DAY) {
    const h = Math.floor(abs / HOUR);
    const m = Math.floor((abs % HOUR) / 60_000);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(abs / DAY);
  const h = Math.floor((abs % DAY) / HOUR);
  return h ? `${d}d ${h}h` : `${d}d`;
}

const STATUS_STYLES: Record<SlaStatus, { bar: string; text: string; bg: string; border: string }> = {
  no_sla:      { bar: "bg-muted",        text: "text-muted-foreground", bg: "bg-muted/30",            border: "border-border" },
  low_risk:    { bar: "bg-emerald-500",  text: "text-emerald-700",      bg: "bg-emerald-500/5",       border: "border-emerald-500/20" },
  medium_risk: { bar: "bg-yellow-500",   text: "text-yellow-700",       bg: "bg-yellow-500/5",        border: "border-yellow-500/20" },
  high_risk:   { bar: "bg-orange-500",   text: "text-orange-700",       bg: "bg-orange-500/5",        border: "border-orange-500/20" },
  breached:    { bar: "bg-destructive",  text: "text-destructive",      bg: "bg-destructive/5",       border: "border-destructive/20" },
  achieved:    { bar: "bg-emerald-600",  text: "text-emerald-700",      bg: "bg-emerald-500/5",       border: "border-emerald-500/20" },
  failed:      { bar: "bg-destructive",  text: "text-destructive",      bg: "bg-destructive/5",       border: "border-destructive/20" },
};

export function SlaDetailCard({ task, slaRules }: SlaDetailCardProps) {
  const status = getSlaStatus(task);

  if (status === "no_sla") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const styles = STATUS_STYLES[status];
  const matchedRule = matchSlaRule(task.priority, slaRules);
  const matchedFull = matchedRule
    ? slaRules.find(r => r.priority_filter === matchedRule.priority_filter
        && r.duration_hours === matchedRule.duration_hours
        && r.is_removal === matchedRule.is_removal) || null
    : null;
  const ruleName = matchedFull?.name?.trim() || (matchedRule ? `Priority: ${task.priority || "no_priority"}` : null);

  const now = Date.now();
  const deadline = task.sla_deadline ? new Date(task.sla_deadline).getTime() : 0;
  const startedAt = task.sla_started_at ? new Date(task.sla_started_at).getTime() : 0;
  const totalMs = (task.sla_duration_hours || 0) * HOUR
    || (deadline && startedAt ? deadline - startedAt : 0);

  const isFinal = status === "achieved" || status === "failed";
  const referenceNow = isFinal && task.updated_at ? new Date(task.updated_at).getTime() : now;
  const elapsedMs = startedAt ? Math.max(0, referenceNow - startedAt) : 0;
  const remainingMs = deadline - referenceNow;
  const overdueMs = remainingMs < 0 ? -remainingMs : 0;

  const pct = totalMs > 0
    ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100))
    : isFinal ? 100 : 0;

  const Icon = status === "achieved" ? Check : status === "failed" ? X : Flame;

  return (
    <div className={cn("rounded-sm border p-2 space-y-1.5 text-xs", styles.border, styles.bg)}>
      {/* Header: status + countdown */}
      <div className="flex items-center justify-between gap-2">
        <div className={cn("flex items-center gap-1.5 font-medium", styles.text)}>
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span>{SLA_STATUS_LABELS[status]}</span>
        </div>
        <div className={cn("font-mono tabular-nums text-[11px]", styles.text)}>
          {status === "breached" && `${formatDelta(overdueMs)} over`}
          {status === "failed"   && `${formatDelta(overdueMs)} late`}
          {status === "achieved" && (totalMs ? `in ${formatDelta(totalMs - elapsedMs > 0 ? totalMs - elapsedMs : 0)}` : "on time")}
          {(status === "low_risk" || status === "medium_risk" || status === "high_risk") &&
            `${formatDelta(remainingMs)} left`}
        </div>
      </div>

      {/* Progress bar */}
      {totalMs > 0 && (
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full transition-all", styles.bar)} style={{ width: `${pct}%` }} />
        </div>
      )}

      {/* Meta line: elapsed / total + rule */}
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {totalMs > 0
            ? <>Elapsed <span className="font-medium text-foreground">{formatDelta(elapsedMs)}</span> of {formatDuration(task.sla_duration_hours || Math.round(totalMs / HOUR))}</>
            : <>Started {startedAt ? formatDelta(now - startedAt) + " ago" : "—"}</>
          }
        </span>
        {ruleName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate max-w-[55%] text-right cursor-help">
                via{" "}
                <span className="font-medium text-foreground underline decoration-dotted underline-offset-2">
                  {ruleName}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="end" className="max-w-[260px] p-2.5 space-y-1.5">
              <div className="text-[11px] font-semibold">{ruleName}</div>
              <div className="grid grid-cols-[60px_1fr] gap-x-2 gap-y-1 text-[11px]">
                <span className="text-muted-foreground">Priorities</span>
                <span className="flex flex-wrap gap-1">
                  {(matchedFull?.priority_filter || matchedRule?.priority_filter || []).map(p => (
                    <span key={p} className="px-1 py-px rounded-sm bg-muted text-foreground">
                      {p.replace("_", " ")}
                    </span>
                  ))}
                </span>
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">
                  {matchedRule?.duration_hours
                    ? formatDuration(matchedRule.duration_hours)
                    : matchedRule?.is_removal
                      ? "Removes SLA"
                      : "—"}
                </span>
              </div>

            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}