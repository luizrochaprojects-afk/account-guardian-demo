import { ReactNode } from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PropertyRowProps {
  label: string;
  value?: ReactNode;
  onEdit?: () => void;
  editing?: boolean;
  editor?: ReactNode;
  calculated?: boolean;
  /**
   * How the value was derived, e.g. "$5,000 x 12 - from Potential MRR".
   * Shown as a tooltip behind a discreet function icon instead of a text
   * badge — the user needs to know where a number comes from, not that it's
   * technically "Calculated".
   */
  formula?: string;
  emptyText?: string;
  className?: string;
  /**
   * This field is blocking the deal from advancing. Renders an amber ground and
   * a warning icon instead of the neutral "Not set", and surfaces `reason` as
   * the row's accessible description.
   *
   * Only takes effect while the row is actually empty, so the signal clears the
   * moment a value lands and returns if it is removed — the caller passes the
   * blocker unconditionally and does not have to track that itself.
   *
   * Colour is never the only carrier (WCAG AA), so the icon and the reason text do the work
   * and the tint just makes it findable on a page of white cards.
   */
  missing?: { reason: string };
}

export function PropertyRow({
  label, value, onEdit, editing, editor, calculated, formula, emptyText = 'Not set', className,
  missing,
}: PropertyRowProps) {
  const isEmpty = value === null || value === undefined || value === '';
  const editable = !!onEdit && !calculated;
  const flagged = isEmpty && !!missing;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && onEdit) {
      e.preventDefault();
      onEdit();
    }
  };

  if (editing && editor) {
    return (
      <div className={cn('flex items-center justify-between gap-3 min-h-9 px-1 -mx-1', className)}>
        <span className="text-xs text-muted-foreground shrink-0">{label}</span>
        <div className="flex-1 max-w-[200px]">{editor}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group flex items-center justify-between gap-3 min-h-9 px-1 -mx-1 rounded-md',
        editable && 'cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        flagged && 'border border-amber-200 bg-amber-50 px-1.5 hover:bg-amber-100/70 focus-visible:bg-amber-100/70',
        className,
      )}
      title={flagged ? missing!.reason : undefined}
      onClick={editable ? onEdit : undefined}
      {...(editable && {
        role: 'button',
        tabIndex: 0,
        onKeyDown: handleKeyDown,
      })}
    >
      <span className={cn('text-xs shrink-0', flagged ? 'text-amber-800' : 'text-muted-foreground')}>
        {label}
      </span>
      <span className="flex items-center gap-1.5 text-xs min-w-0">
        {isEmpty
          ? (
            <span className={cn('flex items-center gap-1', flagged ? 'text-amber-700 font-medium' : 'text-muted-foreground')}>
              {flagged && <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />}
              {/*
                The reason travels with the row rather than only in the tooltip:
                a title attribute is invisible to touch and to screen readers
                that do not announce it, and this is the text that tells someone
                what to actually do.
              */}
              <span>{flagged ? 'Required' : emptyText}</span>
              {flagged && <span className="sr-only">{`— ${missing!.reason}`}</span>}
            </span>
          )
          : <span className={cn('truncate', calculated && 'italic text-muted-foreground')}>{value}</span>}
        {calculated && formula && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[10px] font-serif italic text-muted-foreground/70 shrink-0 cursor-default" aria-label={`Derived value: ${formula}`}>
                  ƒ
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">{formula}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {editable && <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 shrink-0" />}
      </span>
    </div>
  );
}
