import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

export function TrendIndicator({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <ArrowUp className="h-3 w-3 text-emerald-600" />;
  if (trend === 'down') return <ArrowDown className="h-3 w-3 text-destructive" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}
