import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lightweight skeleton used as a Suspense fallback for route chunks.
 * Renders inside <main /> so the sidebar + header stay mounted; only the
 * content area shows the pulse during the brief chunk download.
 */
export function RouteSkeleton() {
  return (
    <div
      className="h-full w-full flex flex-col gap-4 p-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading page…</span>
      {/* Page header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-8 w-24" />
      </div>
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      {/* Content rows */}
      <div className="flex flex-col gap-2 mt-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
