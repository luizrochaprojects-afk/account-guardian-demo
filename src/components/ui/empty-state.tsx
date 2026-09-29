import { type LucideIcon, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Lucide icon component. Defaults to Inbox. */
  icon?: LucideIcon;
  /** Required short title, e.g. "No contacts yet" */
  title?: string;
  /** Optional helper line below the title */
  description?: string;
  /** Optional action slot (typically a Button) */
  action?: React.ReactNode;
  /** Backwards-compat: if provided alone, used as the title */
  message?: string;
  /** Compact variant: smaller padding and icon */
  compact?: boolean;
  className?: string;
}

/**
 * Linear-style empty state. Layout-neutral — drop inside a Card, a Table cell,
 * or a flex container. Use `<TableEmptyRow>` for table contexts.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  message,
  compact,
  className,
}: EmptyStateProps) {
  const heading = title ?? message ?? "Nothing here yet";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-6" : "px-6 py-12",
        className,
      )}
    >
      <div className={cn("rounded-full bg-muted/60 flex items-center justify-center mb-3", compact ? "h-8 w-8" : "h-10 w-10")}>
        <Icon className={cn("text-muted-foreground", compact ? "h-4 w-4" : "h-5 w-5")} strokeWidth={1.75} />
      </div>
      <p className="text-sm font-medium text-foreground">{heading}</p>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
