import { Flame, Check, X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getSlaStatus,
  formatTimeRemaining,
  SLA_STATUS_LABELS,
  type SlaStatus,
} from "@/lib/slaUtils";

interface SlaIndicatorProps {
  task: {
    sla_deadline?: string | null;
    sla_started_at?: string | null;
    sla_duration_hours?: number | null;
    is_done?: boolean;
    status?: string;
    updated_at?: string;
  };
  className?: string;
}

const statusStyles: Record<SlaStatus, string> = {
  no_sla: "",
  low_risk: "text-muted-foreground",
  medium_risk: "text-yellow-500",
  high_risk: "text-orange-500",
  breached: "text-destructive",
  achieved: "text-emerald-600",
  failed: "text-destructive",
};

export function SlaIndicator({ task, className = "" }: SlaIndicatorProps) {
  const status = getSlaStatus(task);
  if (status === "no_sla") return null;

  const color = statusStyles[status];
  const label = SLA_STATUS_LABELS[status];
  const timeStr = task.sla_deadline ? formatTimeRemaining(task.sla_deadline) : "";

  const tooltipText =
    status === "achieved"
      ? "SLA achieved"
      : status === "failed"
        ? `SLA failed (${timeStr} over)`
        : status === "breached"
          ? `SLA breached ${timeStr} ago`
          : `${label} — ${timeStr} left`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center ${color} ${className}`}>
          {status === "achieved" ? (
            <Check className="h-3.5 w-3.5" />
          ) : status === "failed" ? (
            <X className="h-3.5 w-3.5" />
          ) : (
            <Flame className="h-3.5 w-3.5" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
