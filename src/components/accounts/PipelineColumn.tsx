import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { PipelineCard } from './PipelineCard';
import { PipelineQuickAdd } from './PipelineQuickAdd';
import { Badge } from '@/components/ui/badge';
import { isReasonGated } from '@/lib/stageReasons';
import type { PipelineStage } from '@/lib/transitionStage';
import type { Account } from '@/contexts/AccountsContext';
import { cn } from '@/lib/utils';
import { useMoney } from '@/hooks/useMoney';
import { compactAmount } from '@/lib/customerPortfolio';

interface Props {
  stage: string;
  label: string;
  accounts: Account[];
  /** Omit to hide the quick-add affordance entirely. Resolves `true` on success. */
  onQuickCreate?: (name: string) => Promise<boolean>;
  /**
   * Usage subtotal over the last 4 weeks. Passed in — not looked up — because
   * the parent already holds the signals map and the column should stay a pure
   * presenter. When present it REPLACES the potential-ARR subtotal: a live
   * customer's potential ARR is a number from a negotiation that already ended.
   */
  usageTotal?: number;
}

// Hover/focus reveal for the quick-add trigger, and its inverse for the
// placeholder it replaces. The group is NAMED because PipelineCard uses an
// unnamed `group` for its own "+ Log" button — an unnamed group here would
// reveal every card's Log button on column hover.
const REVEAL = 'opacity-0 transition-opacity group-hover/col:opacity-100 group-focus-within/col:opacity-100';
const FADE = 'transition-opacity group-hover/col:opacity-0 group-focus-within/col:opacity-0';

export function PipelineColumn({
  stage,
  label,
  accounts,
  onQuickCreate,
  usageTotal,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const [composerOpen, setComposerOpen] = useState(false);

  // Reason-gated stages (Disqualified / Closed Lost / Churned) can't be created
  // into: the RPC demands a reason and `chk_loss_reason_required_when_lost`
  // rejects the insert outright.
  const canQuickAdd = !!onQuickCreate && !isReasonGated(stage as PipelineStage);
  const showPlaceholder = accounts.length === 0 && !composerOpen;

  // Subtotal for the stage, shown in the header when non-zero. Customer columns
  // get 4-week usage from the parent; everyone else gets potential ARR.
  const { money } = useMoney();
  const isCustomerColumn = usageTotal !== undefined;
  const stageArr = accounts.reduce((sum, a) => sum + (Number(a.arr) || 0), 0);
  const subtotal = isCustomerColumn
    ? usageTotal > 0
      ? `${compactAmount(usageTotal)} usage / 4w`
      : null
    : stageArr > 0
      ? money(stageArr)
      : null;

  const quickAdd = canQuickAdd && (
    <PipelineQuickAdd
      stageLabel={label}
      variant={accounts.length > 0 ? 'inline' : 'empty'}
      open={composerOpen}
      onOpenChange={setComposerOpen}
      onCreate={onQuickCreate!}
      triggerClassName={cn(REVEAL, showPlaceholder && 'col-start-1 row-start-1')}
    />
  );

  return (
    <div
      ref={setNodeRef}
      data-stage={stage}
      className={cn(
        'group/col flex flex-col flex-1 min-w-[250px] max-w-[340px] h-full rounded-lg border transition-colors',
        isOver ? 'border-primary bg-accent' : 'border-subtle bg-muted/40',
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-t-lg border-b border-subtle">
        <span className="text-sm font-semibold text-foreground truncate">{label}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {subtotal && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {subtotal}
            </span>
          )}
          <Badge variant="neutral" className="tabular-nums">{accounts.length}</Badge>
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {accounts.length > 0 && (
          <div className="space-y-2">
            {accounts.map((a) => <PipelineCard key={a.id} account={a} />)}
          </div>
        )}

        {showPlaceholder ? (
          // Placeholder and trigger share one grid cell, so they crossfade in
          // place — same box, same height, no layout shift on hover.
          <div className="grid">
            <div
              className={cn(
                'col-start-1 row-start-1 rounded-lg border border-dashed border-border py-6 px-4 text-center',
                canQuickAdd && [FADE, 'pointer-events-none'],
              )}
            >
              <div className="text-xs font-medium text-muted-foreground">No accounts</div>
              <div className="text-[11px] text-muted-foreground/70 mt-0.5">Drag an account here</div>
            </div>
            {quickAdd}
          </div>
        ) : (
          quickAdd
        )}
      </div>
    </div>
  );
}
