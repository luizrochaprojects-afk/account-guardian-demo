import { useEffect, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";

import { cn } from "@/lib/utils";

/** Below this, a refetch is imperceptible and a bar would just flash. */
const SHOW_AFTER_MS = 250;

/**
 * The app-wide "revalidating" hairline, pinned under the top header.
 *
 * WHY: the QueryClient runs `placeholderData: (prev) => prev` globally
 * (src/App.tsx), so changing a period, a week or an account keeps the PREVIOUS
 * answer on screen with `isLoading === false` — and then it silently swaps.
 * Numbers are load-bearing here, so the fix is not to hide them behind a
 * skeleton on every filter change; it is to say out loud that the figure on
 * screen is being checked. Motion clarifies the state, it never gates it.
 *
 * Deliberately not the primary red: this is chrome, and the red is rationed to
 * the action the user takes and the focus ring.
 */
export function GlobalFetchBar({ className }: { className?: string }) {
  const fetching = useIsFetching();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!fetching) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [fetching]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden",
        "transition-opacity duration-200 ease-out",
        visible ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      <div className="h-full w-2/5 animate-fetch-sweep bg-foreground/40" />
    </div>
  );
}
