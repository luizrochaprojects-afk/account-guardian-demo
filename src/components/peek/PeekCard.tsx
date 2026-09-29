import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PeekCardProps {
  open: boolean;
  children: ReactNode;
  /** Optional title rendered in the header strip. */
  title?: ReactNode;
}

/**
 * Floating, non-modal peek panel anchored bottom-right.
 * Click-outside does not close it (matches Linear). Closing happens via
 * Space/Esc handled by `usePeekFocus`.
 */
export function PeekCard({ open, title, children }: PeekCardProps) {
  if (!open) return null;
  return (
    <div
      role="complementary"
      aria-label="Peek preview"
      className={cn(
        "fixed bottom-4 right-4 z-40 w-[420px] max-h-[60vh] overflow-y-auto",
        "bg-card text-card-foreground border rounded-sm",
        "animate-in fade-in slide-in-from-bottom-2 duration-150",
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-[10px] font-semibold text-muted-foreground">
          {title ?? "Peek"}
        </span>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <kbd className="px-1 py-0.5 border rounded-sm bg-muted/50 font-mono text-[9px]">Space</kbd>
          to close
          <span className="opacity-50">·</span>
          <kbd className="px-1 py-0.5 border rounded-sm bg-muted/50 font-mono text-[9px]">Esc</kbd>
          to clear
        </span>
      </div>
      {children}
    </div>
  );
}