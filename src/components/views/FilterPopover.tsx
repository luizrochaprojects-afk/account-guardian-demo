import { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterPopoverProps {
  activeCount?: number;
  children: ReactNode;
  className?: string;
}

export function FilterPopover({ activeCount = 0, children, className }: FilterPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-7 w-7 p-0 relative", className)}
        >
          <ListFilter className="h-3.5 w-3.5" />
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive border border-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[440px] p-0">
        <div className="px-3 py-2 border-b">
          <p className="text-[11px] font-medium">Filter</p>
        </div>
        {children}
      </PopoverContent>
    </Popover>
  );
}
