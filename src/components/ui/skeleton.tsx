import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

/**
 * The two shapes that recur across the whole app, so surfaces stop hand-rolling
 * them and stop drifting apart. Everything else stays a local <Skeleton> matched
 * to its own content — a skeleton that does not have the shape of what replaces
 * it just trades a blank screen for a different layout jump.
 *
 * Both announce themselves: a screen reader gets "loading", not silence.
 */

interface LoadingRegionProps {
  label?: string;
  className?: string;
}

/** Wrapper that makes any skeleton block a polite live region. */
function LoadingRegion({
  label = "Loading",
  className,
  children,
}: LoadingRegionProps & { children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

interface KpiRowSkeletonProps extends LoadingRegionProps {
  /** How many tiles the real row renders. */
  count?: number;
  /** Tailwind grid classes of the row being stood in for. */
  gridClassName?: string;
}

/**
 * A row of metric tiles. Height matches NorthStarCard (p-5 header + 3xl value),
 * so the real numbers land exactly where the placeholder sat.
 */
function KpiRowSkeleton({
  count = 4,
  gridClassName = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4",
  label = "Loading metrics",
  className,
}: KpiRowSkeletonProps) {
  return (
    <LoadingRegion label={label} className={className}>
      <div className={gridClassName}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="h-[104px] rounded-lg border border-border p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="mt-4 h-8 w-20" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

interface TableSkeletonProps extends LoadingRegionProps {
  rows?: number;
  /**
   * Column widths, as Tailwind width classes. Varied by default on purpose:
   * a stack of identical full-width bars reads as a progress bar, not a table.
   */
  cols?: string[];
  /** Render the header row. Off when the caller keeps its own <TableHeader />. */
  header?: boolean;
}

function TableSkeleton({
  rows = 8,
  cols = ["w-40", "w-24", "w-16", "w-20", "w-14"],
  header = true,
  label = "Loading rows",
  className,
}: TableSkeletonProps) {
  return (
    <LoadingRegion label={label} className={cn("w-full", className)}>
      {header && (
        <div className="flex items-center gap-4 border-b border-border px-3 py-2">
          {cols.map((w, i) => (
            <Skeleton key={i} className={cn("h-3 shrink-0", w)} />
          ))}
        </div>
      )}
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-3 py-2.5">
            {cols.map((w, c) => (
              <Skeleton key={c} className={cn("h-4 shrink-0", w)} />
            ))}
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export { Skeleton, KpiRowSkeleton, TableSkeleton, LoadingRegion };
