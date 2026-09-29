import { ReactNode } from 'react';
import { SearchInput } from '@/components/ui/search-input';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ListToolbarProps {
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  /** Filter pills / active filter chips rendered before the count. */
  filterChips?: ReactNode;
  /** Filter trigger button(s) (e.g. a Popover). */
  filterTrigger?: ReactNode;
  /** Trailing controls — typically Sort + Columns. */
  trailing?: ReactNode;
  /** Result count e.g. "12 of 28". */
  count: string;
  /** Show clear button (clears search + filters). */
  showClear?: boolean;
  onClear?: () => void;
  className?: string;
}

/**
 * Sticky listing toolbar — search · filters · sort · columns · count.
 * Sits beneath the page header and stays in view while scrolling the table.
 */
export function ListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filterChips,
  filterTrigger,
  trailing,
  count,
  showClear,
  onClear,
  className,
}: ListToolbarProps) {
  return (
    <div
      className={cn(
        'sticky top-0 z-10 flex items-center justify-between gap-2 px-6 py-2 border-b bg-background/95 backdrop-blur',
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
        <SearchInput
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={e => onSearchChange(e.target.value)}
        />
        {filterTrigger}
        {filterChips && (
          <div className="flex items-center gap-1 overflow-x-auto min-w-0">
            {filterChips}
          </div>
        )}
        {showClear && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] gap-1 text-muted-foreground"
            onClick={onClear}
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[11px] text-muted-foreground mr-1">{count}</span>
        {trailing}
      </div>
    </div>
  );
}

interface FilterChipProps {
  label: string;
  onRemove: () => void;
}

export function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 h-5 px-1.5 rounded-sm bg-accent text-[11px] hover:bg-accent/70 transition-colors shrink-0"
    >
      <span>{label}</span>
      <X className="h-2.5 w-2.5" />
    </button>
  );
}

interface FilterChipGroupProps {
  /** Group label, e.g. "Status". Rendered as muted prefix on first chip. */
  label: string;
  /** Selected values to render. Each becomes one chip. */
  values: { value: string; label: string }[];
  onRemove: (value: string) => void;
  /** Optional: clear all values in this group. Shown when 3+ chips are selected. */
  onClearAll?: () => void;
}

/**
 * Renders a label + a row of removable chips for a multi-select filter.
 * Used in `ListToolbar`'s `filterChips` slot to mirror what's selected
 * inside a `MultiSelectFilter` popover.
 */
export function FilterChipGroup({ label, values, onRemove, onClearAll }: FilterChipGroupProps) {
  if (values.length === 0) return null;
  return (
    <div className="inline-flex items-center gap-1 shrink-0">
      <span className="text-[11px] text-muted-foreground">{label}:</span>
      {values.map(v => (
        <button
          key={v.value}
          type="button"
          onClick={() => onRemove(v.value)}
          className="inline-flex items-center gap-1 h-5 px-1.5 rounded-sm bg-accent text-[11px] hover:bg-accent/70 transition-colors shrink-0"
        >
          <span>{v.label}</span>
          <X className="h-2.5 w-2.5" />
        </button>
      ))}
      {onClearAll && values.length >= 3 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-[10px] text-muted-foreground hover:text-foreground ml-0.5"
        >
          clear
        </button>
      )}
    </div>
  );
}