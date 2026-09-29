import { cn } from '@/lib/utils';

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'no_priority';

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  no_priority: 'No priority',
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: 'text-destructive',
  high: 'text-orange-500',
  medium: 'text-amber-500',
  low: 'text-blue-500',
  no_priority: 'text-muted-foreground',
};

export function TaskStatusIcon({ status, className, size = 16 }: { status: TaskStatus; className?: string; size?: number }) {
  const half = size / 2;
  const r = half - 1.5;
  const strokeW = 1.5;

  if (status === 'done') {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('shrink-0', className)}>
        <circle cx={half} cy={half} r={r} fill="hsl(var(--primary))" stroke="none" />
        <polyline
          points={`${half - 3},${half} ${half - 0.5},${half + 2.5} ${half + 3.5},${half - 2.5}`}
          fill="none" stroke="white" strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (status === 'cancelled') {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('shrink-0 text-muted-foreground', className)}>
        <circle cx={half} cy={half} r={r} fill="none" stroke="currentColor" strokeWidth={strokeW} />
        <line x1={half - 2.5} y1={half - 2.5} x2={half + 2.5} y2={half + 2.5} stroke="currentColor" strokeWidth={strokeW} strokeLinecap="round" />
      </svg>
    );
  }

  if (status === 'in_progress') {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('shrink-0 text-amber-500', className)}>
        <circle cx={half} cy={half} r={r} fill="none" stroke="currentColor" strokeWidth={strokeW} />
        <path
          d={`M ${half} ${half - r} A ${r} ${r} 0 1 1 ${half - r} ${half}`}
          fill="none" stroke="currentColor" strokeWidth={strokeW + 1} strokeLinecap="round"
        />
      </svg>
    );
  }

  if (status === 'backlog') {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('shrink-0 text-muted-foreground', className)}>
        <circle cx={half} cy={half} r={r} fill="none" stroke="currentColor" strokeWidth={strokeW} strokeDasharray="2 2" />
      </svg>
    );
  }

  // todo
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('shrink-0 text-muted-foreground', className)}>
      <circle cx={half} cy={half} r={r} fill="none" stroke="currentColor" strokeWidth={strokeW} />
    </svg>
  );
}

export function PriorityIcon({ priority, className, size = 14 }: { priority: TaskPriority | null; className?: string; size?: number }) {
  const p = priority || 'no_priority';
  const barCount = p === 'urgent' ? 4 : p === 'high' ? 3 : p === 'medium' ? 2 : p === 'low' ? 1 : 0;

  if (barCount === 0) return null;

  const barW = 2;
  const gap = 1.5;
  const totalW = barCount * barW + (barCount - 1) * gap;
  const startX = (size - totalW) / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('shrink-0', PRIORITY_COLORS[p], className)}>
      {Array.from({ length: barCount }).map((_, i) => {
        const h = 4 + i * 2;
        return (
          <rect
            key={i}
            x={startX + i * (barW + gap)}
            y={size - 2 - h}
            width={barW}
            height={h}
            rx={0.5}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}

export { STATUS_LABELS, PRIORITY_LABELS, PRIORITY_COLORS };
