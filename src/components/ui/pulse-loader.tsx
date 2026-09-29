import { cn } from "@/lib/utils";

interface PulseLoaderProps {
  size?: number;
  className?: string;
  label?: string;
}

export function PulseLoader({ size = 20, className, label = "Loading" }: PulseLoaderProps) {
  return (
    <div className={cn("flex items-center justify-center", className)} role="status" aria-live="polite">
      <span
        className="pulse-loader"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}