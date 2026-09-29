import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Columns3, type LucideIcon } from 'lucide-react';

export interface ColumnDef {
  key: string;
  label: string;
  /** When true, the column cannot be hidden (e.g. the primary identifier). */
  required?: boolean;
}

interface ColumnsMenuProps {
  columns: ColumnDef[];
  visible: Set<string>;
  onToggle: (key: string) => void;
  onReset: () => void;
  /**
   * Trigger icon, tooltip and popover heading. Defaulted to the table wording
   * so the three listing pages that predate these props keep their exact look;
   * the pipeline board passes its own, because "Columns" reads wrong on a
   * board made of cards.
   */
  icon?: LucideIcon;
  title?: string;
  heading?: string;
}

export function ColumnsMenu({
  columns,
  visible,
  onToggle,
  onReset,
  icon: Icon = Columns3,
  title = 'Toggle columns',
  heading = 'Columns',
}: ColumnsMenuProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title={title}>
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[220px] p-0 max-h-[400px] overflow-y-auto">
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground">{heading}</span>
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={onReset}
          >
            Reset
          </button>
        </div>
        <div className="px-2 py-1.5 space-y-0.5">
          {columns.map(col => (
            col.required ? (
              <div key={col.key} className="flex items-center gap-2 px-1.5 py-1 opacity-60">
                <Checkbox checked disabled className="h-3.5 w-3.5" />
                <span className="text-[12px]">{col.label}</span>
              </div>
            ) : (
              <button
                key={col.key}
                type="button"
                className="flex items-center gap-2 w-full px-1.5 py-1 rounded-sm text-left hover:bg-muted/50 transition-colors"
                onClick={() => onToggle(col.key)}
              >
                <Checkbox checked={visible.has(col.key)} className="h-3.5 w-3.5 pointer-events-none" />
                <span className="text-[12px]">{col.label}</span>
              </button>
            )
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}