import { useRef } from 'react';
import { Trash2, UserCircle2, PanelRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { EditableTitle } from '@/components/EditableTitle';
import { TaskStatusIcon, STATUS_LABELS, type TaskStatus } from '@/components/TaskStatusIcon';
import { InlineDueDate } from '@/components/InlineDueDate';
import { InlinePriority } from '@/components/InlinePriority';
import { isTerminalStatus } from '@/lib/issueSort';
import { initialsOf } from '@/lib/initials';
import { cn } from '@/lib/utils';
import type { DbTask } from '@/hooks/useProjectsDB';

const ALL_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'];

/** Controls that own their click — a click landing here must not start a rename. */
const ROW_CONTROLS = 'button,[role="combobox"],input,textarea,a';

interface AccountIssueRowProps {
  task: DbTask;
  orgMembers: { user_id: string; display_name: string | null }[];
  isSelected: boolean;
  onUpdate: (patch: Partial<DbTask>) => void;
  onStatusChange: (status: string) => void;
  onOpenPanel: () => void;
  onDelete: () => void;
}

/**
 * One issue row. Must stay at module scope — declaring it inside AccountWorkTab
 * would give it a fresh identity each render, remounting every row on each
 * keystroke and blowing away focus in the title input.
 */
export function AccountIssueRow({
  task, orgMembers, isSelected, onUpdate, onStatusChange, onOpenPanel, onDelete,
}: AccountIssueRowProps) {
  const titleRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const status = (task.status as TaskStatus) || 'todo';
  const done = isTerminalStatus(task.status);
  const assignee = task.assign_to ? orgMembers.find(m => m.user_id === task.assign_to) : undefined;

  // Clicking the row's dead space starts a rename. Clicks on a real control —
  // or on the title input itself, where the browser positions the caret where
  // you clicked — are left completely alone.
  const handleRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(ROW_CONTROLS)) return;
    const input = titleRef.current as HTMLInputElement | null;
    if (!input) return;
    input.focus();
    // Caret at the end, never select-all: a stray keystroke shouldn't wipe the name.
    input.setSelectionRange(input.value.length, input.value.length);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 group cursor-text transition-colors",
        isSelected ? 'bg-accent' : 'hover:bg-muted/30',
      )}
      onClick={handleRowClick}
    >
      <Select value={(task.status as string) || 'todo'} onValueChange={onStatusChange}>
        {/* [&>svg]:hidden hides the Radix chevron — which means any icon passed as a
            direct child gets hidden too. Keep it wrapped in the span below. */}
        <SelectTrigger
          className="h-6 w-6 shrink-0 justify-center p-0 border-none shadow-none bg-transparent rounded-sm focus:ring-0 hover:bg-muted/60 data-[state=open]:bg-muted/60 [&>svg]:hidden"
          onClick={e => e.stopPropagation()}
          title={STATUS_LABELS[status]}
          aria-label="Status"
        >
          <span className="flex items-center justify-center">
            <TaskStatusIcon status={status} size={14} />
          </span>
        </SelectTrigger>
        <SelectContent>
          {ALL_STATUSES.map(s => (
            <SelectItem key={s} value={s}>
              <span className="flex items-center gap-1.5">
                <TaskStatusIcon status={s} size={12} />
                {STATUS_LABELS[s]}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {task.code && (
        <span className="font-mono text-[11px] text-muted-foreground shrink-0">{task.code}</span>
      )}

      {/* The strikethrough has to sit on the input itself — text-decoration does
          not reach into form controls from an ancestor. */}
      <EditableTitle
        inputRef={titleRef}
        value={task.name}
        onSave={v => onUpdate({ name: v })}
        as="span"
        className={cn("text-sm w-full", done && "line-through text-muted-foreground")}
        placeholder="Issue title"
        ariaLabel="Issue title"
      />

      <InlinePriority
        className="shrink-0 justify-center"
        value={task.priority}
        onCommit={v => onUpdate({ priority: v })}
      />

      <Select
        value={task.assign_to || '__unassigned'}
        onValueChange={v => onUpdate({ assign_to: v === '__unassigned' ? null : v })}
      >
        {/* Same wrapping rule as the status trigger above. */}
        <SelectTrigger
          className="h-6 w-6 shrink-0 justify-center p-0 border-none shadow-none bg-transparent rounded-full focus:ring-0 hover:bg-muted [&>svg]:hidden"
          onClick={e => e.stopPropagation()}
          title={assignee ? (assignee.display_name || 'Assigned') : 'Unassigned'}
          aria-label="Owner"
        >
          <span className="flex items-center justify-center">
            {task.assign_to ? (
              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[9px] font-medium flex items-center justify-center">
                {initialsOf(assignee?.display_name)}
              </span>
            ) : (
              <UserCircle2 className="h-4 w-4 text-muted-foreground/40" />
            )}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__unassigned">Unassigned</SelectItem>
          {orgMembers.map(m => (
            <SelectItem key={m.user_id} value={m.user_id}>{m.display_name || 'Unnamed'}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="shrink-0">
        <InlineDueDate
          value={task.due_date}
          isDone={done}
          onCommit={v => onUpdate({ due_date: v })}
        />
      </div>

      {/* Always visible — this button is the only way into the detail panel, so
          hover-reveal would make it undiscoverable and unusable on touch. */}
      <button
        className="p-0.5 rounded-sm shrink-0 text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
        onClick={onOpenPanel}
        title="Open details"
        aria-label="Open details"
      >
        <PanelRight className="h-3 w-3" />
      </button>
      <button
        className="p-0.5 rounded-sm shrink-0 hover:bg-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        onClick={onDelete}
        title="Delete issue"
        aria-label="Delete issue"
      >
        <Trash2 className="h-3 w-3 text-destructive" />
      </button>
    </div>
  );
}
