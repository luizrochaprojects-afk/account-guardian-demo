import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { SortDir } from './useListingPrefs';

export interface SortOption<K extends string> {
  value: K;
  label: string;
  defaultDir?: SortDir;
}

interface SortMenuProps<K extends string> {
  options: SortOption<K>[];
  sortBy: K;
  sortDir: SortDir;
  onChange: (key: K, dir: SortDir) => void;
}

export function SortMenu<K extends string>({ options, sortBy, sortDir, onChange }: SortMenuProps<K>) {
  const current = options.find(o => o.value === sortBy);
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1">
            <ArrowUpDown className="h-3 w-3" />
            <span>{current?.label || 'Sort'}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[180px] p-1">
          {options.map(o => (
            <button
              type="button"
              key={o.value}
              className={`flex items-center justify-between w-full px-2 py-1 rounded-sm text-left text-[12px] transition-colors ${sortBy === o.value ? 'bg-accent' : 'hover:bg-muted/50'}`}
              onClick={() => {
                if (sortBy === o.value) {
                  onChange(o.value, sortDir === 'asc' ? 'desc' : 'asc');
                } else {
                  onChange(o.value, o.defaultDir || 'desc');
                }
              }}
            >
              <span>{o.label}</span>
              {sortBy === o.value && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onChange(sortBy, sortDir === 'asc' ? 'desc' : 'asc')}
        title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
      >
        {sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      </Button>
    </>
  );
}