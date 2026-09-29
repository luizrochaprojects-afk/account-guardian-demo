import { Link } from 'react-router-dom';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface NorthStarCardProps {
  title: string;
  primaryValue: string | number;
  secondaryValue?: string;
  sparklineData?: Array<{ x: string; y: number }>;
  drilldownHref?: string;
  isLoading?: boolean;
}

export function NorthStarCard({
  title,
  primaryValue,
  secondaryValue,
  sparklineData,
  drilldownHref,
  isLoading,
}: NorthStarCardProps) {
  const inner = (
    <Card
      className={cn(
        'h-full transition-colors',
        drilldownHref && 'hover:bg-accent hover:text-accent-foreground cursor-pointer',
      )}
    >
      <CardHeader className="p-5 pb-2 space-y-0">
        <span className="text-[13px] font-medium text-muted-foreground">
          {title}
        </span>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <div className="flex items-end justify-between gap-2">
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-semibold leading-none tabular-nums">{primaryValue}</div>
            )}
            {secondaryValue && !isLoading && (
              <div className="text-sm text-muted-foreground mt-2 truncate">{secondaryValue}</div>
            )}
          </div>
          {sparklineData && sparklineData.length > 1 && !isLoading && (
            <div className="w-16 h-10 shrink-0 text-muted-foreground">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparklineData}>
                  <Line
                    type="monotone"
                    dataKey="y"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (drilldownHref) {
    return (
      <Link to={drilldownHref} className="block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}
