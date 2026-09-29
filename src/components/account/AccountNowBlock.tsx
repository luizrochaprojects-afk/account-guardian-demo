import { useState } from 'react';
import { Check, Plus, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TaskStatusIcon, type TaskStatus } from '@/components/TaskStatusIcon';
import { InlineDueDate } from '@/components/InlineDueDate';
import { AccountAgentNotice } from './AccountAgentNotice';
import { initialsOf } from '@/lib/initials';
import { formatCurrencyValue } from '@/lib/currency';
import { useOrgSettings } from '@/hooks/useOrgSettings';
import type { Account } from '@/contexts/AccountsContext';
import type { DbTask } from '@/hooks/useProjectsDB';
import type { OrgMember } from '@/hooks/useOrgMembers';

interface Props {
  account: Account;
  /**
   * Open, top-level issues for this account (no parent) — the same definition
   * Delivery uses, project-bound issues included, so the two never disagree.
   */
  openIssues: DbTask[];
  orgMembers: OrgMember[];
  onUpdateTask: (id: string, patch: Partial<DbTask>) => void;
  onCreateIssue: (name: string) => Promise<void>;
  onOpenTab: (tab: string) => void;
  onFocusSidebarField: (field: 'mrr') => void;
}

/**
 * The "Now" block: what belongs front and center on Overview — the next
 * action, what's blocking it, the one critical field still missing, and the
 * agent's pending suggestion — in one place instead of several cards that
 * repeat the stage and a full-bleed banner.
 */
export function AccountNowBlock({
  account, openIssues, orgMembers, onUpdateTask, onCreateIssue, onOpenTab, onFocusSidebarField,
}: Props) {
  const { currencySymbol, currencyCode } = useOrgSettings();
  const [quickAdd, setQuickAdd] = useState('');
  const [adding, setAdding] = useState(false);

  const sorted = [...openIssues].sort((a, b) => {
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return a.position - b.position;
  });
  const nextAction = sorted[0] ?? null;
  const blocker = openIssues.find((t) => (t.blocked_by?.length ?? 0) > 0) ?? null;
  // `arr` is NOT NULL DEFAULT 0, so "not set" is 0 rather than null. It is
  // derived from Potential MRR, which is what the nudge opens.
  const missingArr = account.pipeline_phase === 'sales' && !account.arr;
  const assignee = nextAction?.assign_to ? orgMembers.find((m) => m.user_id === nextAction.assign_to) : undefined;

  async function submitQuickAdd() {
    const name = quickAdd.trim();
    if (!name) return;
    setAdding(true);
    try {
      await onCreateIssue(name);
      setQuickAdd('');
    } finally {
      setAdding(false);
    }
  }

  const hasAnything = nextAction || blocker || missingArr;

  return (
    <div data-tour="now" className="rounded-lg border bg-card divide-y">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Now</h3>
        <AccountAgentNotice accountId={account.id} compact />
      </div>

      {nextAction ? (
        <div className="flex items-center gap-2.5 px-4 py-3">
          <button
            className="shrink-0"
            onClick={() => onUpdateTask(nextAction.id, { status: 'done', is_done: true })}
            title="Mark done"
            aria-label="Mark next action done"
          >
            <TaskStatusIcon status={(nextAction.status as TaskStatus) || 'todo'} size={16} />
          </button>
          <span className="flex-1 text-sm truncate">{nextAction.name}</span>
          {assignee && (
            <span
              className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[9px] font-medium flex items-center justify-center shrink-0"
              title={assignee.display_name || 'Assigned'}
            >
              {initialsOf(assignee.display_name)}
            </span>
          )}
          <InlineDueDate
            value={nextAction.due_date}
            isDone={false}
            onCommit={(v) => onUpdateTask(nextAction.id, { due_date: v })}
          />
          <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" onClick={() => onOpenTab('delivery')}>
            Reassign / snooze
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3">
          <Input
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submitQuickAdd(); }}
            placeholder="No open issue for this account — what's next?"
            className="h-8 text-sm"
          />
          <Button size="sm" className="h-8 text-xs shrink-0" disabled={!quickAdd.trim() || adding} onClick={() => void submitQuickAdd()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Create issue
          </Button>
        </div>
      )}

      {blocker && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-amber-700 dark:text-amber-500">
          <Ban className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate">Blocked: {blocker.name}</span>
          <Button size="sm" variant="ghost" className="h-6 text-xs shrink-0" onClick={() => onOpenTab('delivery')}>
            View
          </Button>
        </div>
      )}

      {missingArr && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs">
          <span className="flex-1 text-muted-foreground">ARR not set — needed for forecast at this stage.</span>
          <Button size="sm" variant="outline" className="h-6 text-xs shrink-0" onClick={() => onFocusSidebarField('mrr')}>
            + Set MRR
          </Button>
        </div>
      )}

      {!hasAnything && (
        <div className="px-4 py-3 text-xs text-muted-foreground flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5" /> Nothing pending — all clear.
        </div>
      )}

      {account.arr > 0 && (
        <div className="flex items-baseline gap-2 px-4 py-2.5">
          <span className="text-lg font-semibold font-mono">{formatCurrencyValue(account.arr, currencySymbol, currencyCode)}</span>
          <span className="text-xs text-muted-foreground">potential ARR</span>
        </div>
      )}
    </div>
  );
}
