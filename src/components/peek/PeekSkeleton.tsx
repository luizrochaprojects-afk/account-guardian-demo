import { Skeleton } from "@/components/ui/skeleton";

/**
 * Compact skeleton shown inside a PeekCard while the focused row is changing
 * or its associated data is not yet ready. Matches the visual rhythm of
 * IssuePeekContent / ProjectPeekContent so the swap feels stable.
 */
export function IssuePeekSkeleton() {
  return (
    <div className="p-3 space-y-2.5 text-xs" aria-busy="true" aria-live="polite">
      {/* Header row: code + status chip · priority + sla */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-4 w-20 rounded-sm" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-3 rounded-full" />
        </div>
      </div>

      {/* Title */}
      <Skeleton className="h-4 w-3/4" />
      {/* Breadcrumb */}
      <Skeleton className="h-3 w-1/2" />

      {/* Meta grid */}
      <div className="grid grid-cols-[80px_1fr] gap-y-1.5 gap-x-2 pt-1 border-t">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-10" />
      </div>

      {/* Description */}
      <div className="pt-1 border-t space-y-1">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-2/3" />
      </div>

      {/* Footer */}
      <div className="pt-1 border-t flex items-center justify-between">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-2.5 w-14" />
      </div>
    </div>
  );
}

export function ProjectPeekSkeleton() {
  return (
    <div className="p-3 space-y-2.5 text-xs" aria-busy="true" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-4 w-20 rounded-sm" />
        </div>
        <Skeleton className="h-4 w-16 rounded-sm" />
      </div>

      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/3" />

      <div className="pt-1 border-t space-y-1.5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-1 w-full" />
      </div>

      <div className="grid grid-cols-[90px_1fr] gap-y-1.5 gap-x-2 pt-1 border-t">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-24" />
      </div>

      <div className="pt-1 border-t space-y-1">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-10/12" />
      </div>

      <div className="pt-1 border-t flex items-center justify-between">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-2.5 w-14" />
      </div>
    </div>
  );
}