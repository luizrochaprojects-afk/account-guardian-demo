import { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function SectionCard({ title, action, children, className, contentClassName }: SectionCardProps) {
  return (
    <section className={cn('rounded-lg border bg-card', className)}>
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      <div className={cn('px-4 pb-4 pt-2', contentClassName)}>{children}</div>
    </section>
  );
}

/**
 * Compact "+ Add …" affordance for a SectionCard header. Render it only when the
 * section already has rows — an empty section carries its CTA in the EmptyState,
 * and showing both would be redundant.
 */
export function SectionAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="h-6 -mr-1.5 gap-1 px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
    >
      <Plus className="h-3 w-3" />
      {label}
    </Button>
  );
}
