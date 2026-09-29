import { ReactNode } from 'react';
import { TableHead } from '@/components/ui/table';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SortDir } from './useListingPrefs';

interface SortableTableHeadProps<K extends string> {
  sortKey?: K;
  activeKey?: K;
  dir?: SortDir;
  onSort?: (key: K) => void;
  className?: string;
  children: ReactNode;
}

/**
 * Table column header with click-to-sort and a directional arrow.
 * If `sortKey` is omitted the header is a plain (non-sortable) cell.
 */
export function SortableTableHead<K extends string>({
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
  children,
}: SortableTableHeadProps<K>) {
  if (!sortKey || !onSort) {
    return <TableHead className={className}>{children}</TableHead>;
  }
  const active = activeKey === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 -mx-1 px-1 py-0.5 rounded-sm hover:bg-muted/50 transition-colors',
          active && 'text-foreground',
        )}
      >
        {children}
        {active && (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  );
}