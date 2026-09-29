import { cn } from "@/lib/utils";
import { PulseLoader } from "@/components/ui/pulse-loader";

interface ListLoadingProps {
  className?: string;
}

export function ListLoading({ className }: ListLoadingProps) {
  return (
    <PulseLoader className={cn("px-3 py-8", className)} />
  );
}
