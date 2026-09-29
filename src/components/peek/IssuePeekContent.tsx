import { format, parseISO } from "date-fns";
import type { DbTask } from "@/hooks/useProjectsDB";
import { TaskStatusIcon, PriorityIcon, STATUS_LABELS, PRIORITY_LABELS, type TaskStatus, type TaskPriority } from "@/components/TaskStatusIcon";
import { SlaIndicator } from "@/components/SlaIndicator";
import { formatDueLabel, isOverdue } from "@/components/InlineDueDate";
import { cn } from "@/lib/utils";

interface IssuePeekContentProps {
  task: DbTask;
  /** Optional resolved labels surrounding the issue. */
  accountName?: string;
  projectName?: string;
  milestoneName?: string;
  assigneeName?: string;
  subTotal?: number;
  subDone?: number;
}

export function IssuePeekContent({
  task,
  accountName,
  projectName,
  milestoneName,
  assigneeName,
  subTotal = 0,
  subDone = 0,
}: IssuePeekContentProps) {
  const status = (task.status as TaskStatus) || "todo";
  const priority = (task.priority as TaskPriority) || null;
  const code = (task as any).code as string | undefined;
  const dueDate = (task as any).due_date as string | undefined;
  const overdue = isOverdue(dueDate, status === "done" || status === "cancelled");
  const breadcrumbBits = [accountName, projectName, milestoneName].filter(Boolean) as string[];

  const created = task.created_at ? parseISO(task.created_at as string) : null;
  const updated = task.updated_at ? parseISO(task.updated_at as string) : null;

  return (
    <div className="p-3 space-y-2.5 text-xs">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {code && <span className="font-mono text-[10px] text-muted-foreground shrink-0">{code}</span>}
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-muted text-[10px] text-muted-foreground">
            <TaskStatusIcon status={status} size={11} />
            {STATUS_LABELS[status]}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {priority && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <PriorityIcon priority={priority} size={12} />
              {PRIORITY_LABELS[priority]}
            </span>
          )}
          <SlaIndicator task={task as any} />
        </div>
      </div>

      {/* Title */}
      <div className="text-sm font-semibold leading-snug">{task.name}</div>

      {/* Breadcrumb */}
      {breadcrumbBits.length > 0 && (
        <div className="text-[11px] text-muted-foreground truncate">
          {breadcrumbBits.join(" · ")}
        </div>
      )}

      {/* Meta grid */}
      <div className="grid grid-cols-[80px_1fr] gap-y-1 gap-x-2 pt-1 border-t">
        <span className="text-muted-foreground">Assignee</span>
        <span className="truncate">{assigneeName || <span className="text-muted-foreground">—</span>}</span>

        <span className="text-muted-foreground">Due</span>
        <span className={cn("truncate", overdue && "text-destructive font-medium")}>
          {dueDate ? formatDueLabel(dueDate) : <span className="text-muted-foreground">—</span>}
        </span>

        {subTotal > 0 && (
          <>
            <span className="text-muted-foreground">Sub-issues</span>
            <span className="text-muted-foreground tabular-nums">{subDone}/{subTotal}</span>
          </>
        )}

        {task.assigned_role && (
          <>
            <span className="text-muted-foreground">Role</span>
            <span className="truncate text-muted-foreground">{task.assigned_role}</span>
          </>
        )}
      </div>

      {/* Description */}
      {task.objective && (
        <div className="pt-1 border-t">
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4 whitespace-pre-wrap">
            {task.objective}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="pt-1 border-t flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{created ? `Created ${format(created, "MMM d, yyyy")}` : ""}</span>
        <span>{updated ? `Updated ${format(updated, "MMM d")}` : ""}</span>
      </div>
    </div>
  );
}