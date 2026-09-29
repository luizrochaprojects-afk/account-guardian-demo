import { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RowAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  separatorBefore?: boolean;
}

interface RowActionsMenuProps {
  actions: RowAction[];
  className?: string;
}

/**
 * Right-aligned row action menu. Trigger is hidden until the row is hovered
 * (parent row needs the `group` class).
 */
export function RowActionsMenu({ actions, className }: RowActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'p-1 rounded-sm opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity outline-none',
          className,
        )}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {actions.map((a, idx) => (
          <div key={`${a.label}-${idx}`}>
            {a.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className={cn('text-xs', a.destructive && 'text-destructive focus:text-destructive')}
              onSelect={(e) => {
                e.preventDefault();
                a.onSelect();
              }}
            >
              {a.icon && <span className="mr-2 flex h-3.5 w-3.5 items-center justify-center">{a.icon}</span>}
              {a.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}