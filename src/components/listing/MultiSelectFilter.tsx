import { ReactNode, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { ChevronDown, X } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  /** Optional count shown right-aligned (e.g. "38"). */
  count?: number;
}

interface MultiSelectFilterProps {
  /** Label shown when nothing selected (e.g. "Status"). */
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  /** Optional icon shown in the trigger before the label. */
  icon?: ReactNode;
  className?: string;
  /** Width of the popover content. Default 220px. */
  contentWidth?: number;
  /** Limit how many selected values to render in trigger before "+N". */
  triggerMax?: number;
}

/**
 * Linear-style multi-select filter — dashed-border trigger + checkbox popover.
 * Tick multiple values, see them as removable chips in the toolbar.
 */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  searchable = true,
  icon,
  className,
  contentWidth = 240,
  triggerMax = 2,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);

  const selectedSet = new Set(selected);
  const selectedOptions = options.filter(o => selectedSet.has(o.value));

  const toggle = (value: string) => {
    if (selectedSet.has(value)) onChange(selected.filter(v => v !== value));
    else onChange([...selected, value]);
  };

  const clear = () => onChange([]);

  const renderTriggerLabel = () => {
    if (selectedOptions.length === 0) return label;
    if (selectedOptions.length <= triggerMax) {
      return (
        <span className="flex items-center gap-1 truncate">
          <span className="text-muted-foreground">{label}:</span>
          <span className="truncate">{selectedOptions.map(o => o.label).join(', ')}</span>
        </span>
      );
    }
    const head = selectedOptions.slice(0, triggerMax).map(o => o.label).join(', ');
    return (
      <span className="flex items-center gap-1 truncate">
        <span className="text-muted-foreground">{label}:</span>
        <span className="truncate">{head}</span>
        <span className="text-muted-foreground">+{selectedOptions.length - triggerMax}</span>
      </span>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-7 px-2 text-[11px] gap-1 border-dashed font-normal',
            selectedOptions.length > 0 && 'border-solid bg-accent/40',
            className,
          )}
        >
          {icon}
          {renderTriggerLabel()}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0" style={{ width: contentWidth }}>
        <Command>
          {searchable && <CommandInput placeholder={`Search ${label.toLowerCase()}…`} className="h-8 text-xs" />}
          <CommandList className="max-h-[280px]">
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map(o => {
                const checked = selectedSet.has(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.value}`}
                    onSelect={() => toggle(o.value)}
                    className="flex items-center gap-2 cursor-pointer text-xs"
                  >
                    <Checkbox
                      checked={checked}
                      className="h-3.5 w-3.5 pointer-events-none"
                      tabIndex={-1}
                    />
                    {o.icon}
                    <span className="flex-1 truncate">{o.label}</span>
                    {typeof o.count === 'number' && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">{o.count}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {selectedOptions.length > 0 && (
            <div className="border-t px-2 py-1.5 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{selectedOptions.length} selected</span>
              <button
                type="button"
                onClick={clear}
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}