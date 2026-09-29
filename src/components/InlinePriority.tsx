import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PriorityIcon, PRIORITY_LABELS, type TaskPriority } from '@/components/TaskStatusIcon';
import { cn } from '@/lib/utils';

const ALL_PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'no_priority'];

interface InlinePriorityProps {
  value: string | null;
  onCommit: (v: string | null) => void;
  /** Merged onto the trigger button, for row-specific alignment. */
  className?: string;
}

/**
 * Compact priority picker for list rows: a 20px icon button that opens a
 * popover. Stops click propagation so it can live inside a clickable row.
 */
export function InlinePriority({ value, onCommit, className }: InlinePriorityProps) {
  const [open, setOpen] = useState(false);
  const current = (value as TaskPriority) || 'no_priority';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={e => e.stopPropagation()}
          className={cn("flex items-center justify-start h-5 w-5 rounded hover:bg-muted/60 transition-colors", className)}
          aria-label="Set priority"
        >
          {current === 'no_priority'
            ? <span className="block h-1 w-3 rounded-full bg-muted-foreground/30" />
            : <PriorityIcon priority={current} size={14} />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1" onClick={e => e.stopPropagation()}>
        {ALL_PRIORITIES.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => { onCommit(p === 'no_priority' ? null : p); setOpen(false); }}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent text-left",
              current === p && 'bg-accent/60',
            )}
          >
            <span className="w-3.5 flex justify-center">
              {p === 'no_priority'
                ? <span className="block h-1 w-3 rounded-full bg-muted-foreground/40" />
                : <PriorityIcon priority={p} size={12} />}
            </span>
            <span>{PRIORITY_LABELS[p]}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
