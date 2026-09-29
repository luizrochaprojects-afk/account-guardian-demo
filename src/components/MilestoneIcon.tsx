import { cn } from '@/lib/utils';

interface MilestoneIconProps {
  /** 0–100 completion percent */
  progress?: number;
  /** Whether this is the current focus milestone (Linear: yellow diamond) */
  isCurrent?: boolean;
  size?: number;
  className?: string;
}

/**
 * Linear-style milestone diamond.
 * - Empty (gray outline): not started
 * - Yellow filled outline: current focus (next incomplete milestone)
 * - Half / fully filled: based on progress
 * - Green check-fill: completed (100%)
 */
export function MilestoneIcon({ progress = 0, isCurrent = false, size = 14, className }: MilestoneIconProps) {
  const isComplete = progress >= 100;
  const hasProgress = progress > 0 && progress < 100;

  // Color logic — semantic tokens via tailwind text-* classes won't paint SVG fill via currentColor consistently with bg
  // Use CSS variables / tailwind text- classes through currentColor.
  const colorClass = isComplete
    ? 'text-emerald-500'
    : isCurrent
      ? 'text-amber-500'
      : hasProgress
        ? 'text-foreground'
        : 'text-muted-foreground/50';

  // Diamond path (rotated square) centered in 16x16 viewBox
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={cn('shrink-0', colorClass, className)}
      aria-hidden="true"
    >
      {/* Outline */}
      <path
        d="M8 1 L15 8 L8 15 L1 8 Z"
        fill={isComplete || isCurrent ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Partial fill via clip — only when in progress and not current/complete */}
      {hasProgress && !isCurrent && (
        <clipPath id={`ms-clip-${progress}`}>
          <rect x="0" y={16 - (16 * progress) / 100} width="16" height={(16 * progress) / 100} />
        </clipPath>
      )}
      {hasProgress && !isCurrent && (
        <path
          d="M8 1 L15 8 L8 15 L1 8 Z"
          fill="currentColor"
          clipPath={`url(#ms-clip-${progress})`}
        />
      )}
      {/* Check mark when complete */}
      {isComplete && (
        <path
          d="M5 8.5 L7 10.5 L11 6"
          fill="none"
          stroke="hsl(var(--background))"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
