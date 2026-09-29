import { cn } from '@/lib/utils';

export function HealthBadge({ score, size = 'sm', noData = false }: { score: number; size?: 'sm' | 'md'; noData?: boolean }) {
  if (noData) {
    return (
      <span
        title="No health data"
        className={cn(
          'inline-flex items-center justify-center font-mono font-medium rounded-sm bg-muted text-muted-foreground',
          size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1',
        )}
      >
        —
      </span>
    );
  }

  const color = score < 30 ? 'bg-destructive/10 text-destructive'
    : score < 50 ? 'bg-orange-100 text-orange-700'
    : score < 70 ? 'bg-yellow-50 text-yellow-700'
    : 'bg-emerald-50 text-emerald-700';
  
  return (
    <span className={cn(
      'inline-flex items-center justify-center font-mono font-semibold rounded-sm',
      size === 'sm' ? 'text-xs px-1.5 py-0.5 min-w-[32px]' : 'text-sm px-2 py-1 min-w-[40px]',
      color
    )}>
      {score}
    </span>
  );
}
