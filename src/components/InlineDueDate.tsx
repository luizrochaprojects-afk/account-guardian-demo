import { useState } from "react";
import { format, parseISO, isPast, isToday, differenceInCalendarDays } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InlineDueDateProps {
  value: string | null | undefined;
  onCommit: (v: string | null) => void;
  isDone?: boolean;
  /** "compact" = icon + short label (for list rows), "label" = full date label */
  variant?: "compact" | "label";
  className?: string;
}

/** Returns true if the date string (yyyy-MM-dd) is overdue and the task isn't done. */
export function isOverdue(value: string | null | undefined, isDone?: boolean): boolean {
  if (!value || isDone) return false;
  try {
    const d = parseISO(value);
    return isPast(d) && !isToday(d);
  } catch {
    return false;
  }
}

export function formatDueLabel(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const d = parseISO(value);
    const diff = differenceInCalendarDays(d, new Date());
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    if (diff > 1 && diff < 7) return format(d, "EEE");
    return format(d, "MMM d");
  } catch {
    return value;
  }
}

export function InlineDueDate({
  value,
  onCommit,
  isDone,
  variant = "compact",
  className = "",
}: InlineDueDateProps) {
  const [open, setOpen] = useState(false);
  const date = value ? parseISO(value) : undefined;
  const overdue = isOverdue(value, isDone);
  const label = formatDueLabel(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button
          className={cn(
            "inline-flex items-center gap-1 h-6 px-1 rounded-sm text-xs hover:bg-muted/40 transition-colors",
            overdue ? "text-destructive font-medium" : "text-muted-foreground",
            !value && "text-muted-foreground/60",
            className,
          )}
          title={value ? format(parseISO(value), "PPP") : "Set due date"}
        >
          <CalendarIcon className="h-3 w-3 shrink-0" />
          {variant === "label" || value ? (
            <span className="truncate">{label || "—"}</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onCommit(d ? format(d, "yyyy-MM-dd") : null);
            setOpen(false);
          }}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
        {value && (
          <div className="p-2 border-t">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] w-full"
              onClick={() => {
                onCommit(null);
                setOpen(false);
              }}
            >
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}