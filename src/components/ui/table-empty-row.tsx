import { TableCell, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import type { LucideIcon } from "lucide-react";

interface TableEmptyRowProps {
  colSpan: number;
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Tighter padding/icon size — for tables stacked densely on one screen
   * (e.g. two related lists side by side), where several full-size empty
   * states add up to a wall of scroll for "nothing here". */
  compact?: boolean;
}

/**
 * Empty state styled to fill a table body. Use in place of an ad-hoc
 * `<TableRow><TableCell>` empty placeholder.
 */
export function TableEmptyRow({ colSpan, icon, title, description, action, compact }: TableEmptyRowProps) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="p-0">
        <EmptyState icon={icon} title={title} description={description} action={action} compact={compact} />
      </TableCell>
    </TableRow>
  );
}
