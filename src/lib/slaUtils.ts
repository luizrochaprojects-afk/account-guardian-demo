/**
 * SLA status computation and helpers.
 */

export type SlaStatus =
  | "no_sla"
  | "low_risk"
  | "medium_risk"
  | "high_risk"
  | "breached"
  | "achieved"
  | "failed";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface SlaTask {
  sla_deadline?: string | null;
  sla_started_at?: string | null;
  sla_duration_hours?: number | null;
  is_done?: boolean;
  status?: string;
  updated_at?: string;
}

export function getSlaStatus(task: SlaTask): SlaStatus {
  if (!task.sla_deadline) return "no_sla";

  const deadline = new Date(task.sla_deadline).getTime();
  const isDone =
    task.is_done || task.status === "done" || task.status === "cancelled";

  if (isDone) {
    const completedAt = task.updated_at
      ? new Date(task.updated_at).getTime()
      : Date.now();
    return completedAt <= deadline ? "achieved" : "failed";
  }

  const remaining = deadline - Date.now();
  if (remaining < 0) return "breached";
  if (remaining < DAY) return "high_risk";
  if (remaining < 7 * DAY) return "medium_risk";
  return "low_risk";
}

export function formatTimeRemaining(deadline: string): string {
  const remaining = new Date(deadline).getTime() - Date.now();
  const abs = Math.abs(remaining);
  const sign = remaining < 0 ? "-" : "";

  if (abs < HOUR) {
    const mins = Math.ceil(abs / 60000);
    return `${sign}${mins}m`;
  }
  if (abs < DAY) {
    const hours = Math.floor(abs / HOUR);
    return `${sign}${hours}h`;
  }
  const days = Math.floor(abs / DAY);
  const hours = Math.floor((abs % DAY) / HOUR);
  return `${sign}${days}d ${hours}h`;
}

export const SLA_STATUS_LABELS: Record<SlaStatus, string> = {
  no_sla: "No SLA",
  low_risk: "Low risk",
  medium_risk: "Medium risk",
  high_risk: "High risk",
  breached: "Breached",
  achieved: "Achieved",
  failed: "Failed",
};

export const DURATION_PRESETS = [
  { label: "12 hours", hours: 12 },
  { label: "24 hours", hours: 24 },
  { label: "48 hours", hours: 48 },
  { label: "1 week", hours: 168 },
  { label: "2 weeks", hours: 336 },
  { label: "4 weeks", hours: 672 },
] as const;

export function formatDuration(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = hours / 24;
  if (days === 7) return "1 week";
  if (days === 14) return "2 weeks";
  if (days === 28) return "4 weeks";
  if (Number.isInteger(days)) return `${days}d`;
  return `${hours}h`;
}

interface SlaRule {
  priority_filter: string[];
  duration_hours: number | null;
  is_removal: boolean;
}

export function matchSlaRule(
  priority: string | null | undefined,
  rules: SlaRule[]
): SlaRule | null {
  const p = priority || "no_priority";
  for (const rule of rules) {
    if (rule.priority_filter.includes(p)) return rule;
  }
  return null;
}

export function applySlaFields(
  rule: SlaRule | null
): {
  sla_deadline: string | null;
  sla_started_at: string | null;
  sla_duration_hours: number | null;
} {
  if (!rule || rule.is_removal || !rule.duration_hours) {
    return { sla_deadline: null, sla_started_at: null, sla_duration_hours: null };
  }
  const now = new Date();
  const deadline = new Date(now.getTime() + rule.duration_hours * HOUR);
  return {
    sla_deadline: deadline.toISOString(),
    sla_started_at: now.toISOString(),
    sla_duration_hours: rule.duration_hours,
  };
}
