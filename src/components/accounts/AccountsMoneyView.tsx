import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BadgeDollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/demo/db';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useMoney } from '@/hooks/useMoney';
import { useProfile } from '@/hooks/useProfile';
import { useHygieneCounters } from '@/hooks/useHygieneCounters';
import { useTasksDB } from '@/hooks/useProjectsDB';
import { useStageTransition } from '@/hooks/useStageTransition';
import { buildMoneyRows, type MoneyStatus } from '@/lib/moneyView';
import { stageLabel, ALL_STAGES_ORDERED, type PipelineStage } from '@/lib/pipelineStages';
import { useAccounts, accountsListQueryKey, type Account } from '@/contexts/AccountsContext';
import { StageReasonModal } from '@/components/accounts/StageReasonModal';

/**
 * "Near the money": the default screen of the weekly pipeline review, mounted
 * on the dashboard's Pipeline tab. A flat list, not a board: the whole point is one
 * ordering (bottom of the funnel first, biggest projected MRR first) with the
 * red line worked before anything else today. Dragging would only obscure that.
 */

const STATUS_META: Record<MoneyStatus, { label: string; className: string }> = {
  emergency: { label: 'Emergency', className: 'bg-destructive/10 text-destructive' },
  uncovered: { label: 'Uncovered', className: 'bg-destructive/10 text-destructive' },
  attention: { label: 'Attention', className: 'bg-warning/10 text-warning' },
  ok:        { label: 'On track',  className: 'bg-success/10 text-success' },
};

interface Props {
  accounts: Account[];
}

/**
 * Click-to-edit stage cell. Offers the full stage list, not the money subset:
 * the main verbs of this table (closed_won, closed_lost, pilot_running) point
 * *out of* the subset. Close on `onOpenChange(false)`, never onBlur — the
 * Select renders in a portal, so a bubbling blur would unmount the editor
 * before the click lands (see CompanyInfoPanel's note on the same pitfall).
 */
function StageCell({
  stage,
  onChange,
}: {
  stage: PipelineStage;
  onChange: (next: PipelineStage) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        className="cursor-pointer hover:underline decoration-dotted underline-offset-2"
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        {stageLabel(stage, true)}
      </span>
    );
  }
  return (
    <Select
      value={stage}
      defaultOpen
      onValueChange={(v) => {
        onChange(v as PipelineStage);
        setEditing(false);
      }}
      onOpenChange={(o) => {
        if (!o) setEditing(false);
      }}
    >
      <SelectTrigger className="h-6 w-auto min-w-0 gap-1 px-2 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ALL_STAGES_ORDERED.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            {stageLabel(s, true)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Click-to-edit projected MRR. The display is the derived projectedMonthly
 * (mrr, else arr/12); the editor is the raw mrr, because that is the column
 * being written. Blur commits, Enter commits via blur, Escape cancels —
 * EditableTitle's semantics.
 */
function ProjectedCell({
  mrr,
  display,
  onCommit,
}: {
  mrr: number;
  display: string;
  onCommit: (n: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const cancelled = useRef(false);

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        className="cursor-pointer hover:underline decoration-dotted underline-offset-2"
        onClick={() => {
          setValue(mrr > 0 ? String(mrr) : '');
          cancelled.current = false;
          setEditing(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setValue(mrr > 0 ? String(mrr) : '');
            cancelled.current = false;
            setEditing(true);
          }
        }}
      >
        {display}
      </span>
    );
  }

  const commit = () => {
    setEditing(false);
    if (cancelled.current) return;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n === mrr) return;
    onCommit(n);
  };

  return (
    <Input
      type="number"
      min={0}
      autoFocus
      value={value}
      className="ml-auto h-7 w-28 text-right tabular-nums"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * Click-to-edit next step: text + due date together, because the due date is
 * what drives the overdue/emergency status. Commit on container blur (both
 * children are plain inputs, no portal involved), Enter commits, Escape
 * cancels. Empty text cancels — completing/deleting a next step is a task
 * operation, out of scope for this cell.
 */
function NextStepCell({
  nextStep,
  nextStepDue,
  onCommit,
}: {
  nextStep: string | null;
  nextStepDue: string | null;
  onCommit: (name: string, due: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [due, setDue] = useState('');

  const open = () => {
    setName(nextStep ?? '');
    setDue(nextStepDue ?? '');
    setEditing(true);
  };

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        className="block cursor-pointer"
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
      >
        {nextStep ? (
          <span className="truncate block hover:underline decoration-dotted underline-offset-2">
            {nextStep}
            {nextStepDue && (
              <span className="text-xs text-muted-foreground ml-1.5 tabular-nums whitespace-nowrap">
                {new Date(`${nextStepDue}T00:00:00`).toLocaleDateString('en-US')}
              </span>
            )}
          </span>
        ) : (
          <span className="text-xs text-destructive font-medium hover:underline decoration-dotted underline-offset-2">
            no next step
          </span>
        )}
      </span>
    );
  }

  const commit = () => {
    setEditing(false);
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === (nextStep ?? '') && (due || null) === nextStepDue) return;
    onCommit(trimmed, due || null);
  };

  return (
    <div
      className="flex items-center gap-1.5"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-7 text-sm"
        placeholder="Next step"
      />
      <Input
        type="date"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        className="h-7 w-36 text-xs"
      />
    </div>
  );
}

export default function AccountsMoneyView({ accounts }: Props) {
  const { money } = useMoney();
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  const { rows: hygieneRows, isLoading: hygieneLoading } = useHygieneCounters();
  const { updateAccount } = useAccounts();
  // No args on purpose: the list query stays disabled; only the mutators are
  // used, and they patch whatever task caches other surfaces have mounted.
  const { addTask, updateTask } = useTasksDB();
  const { requestStageChange, reasonGatedStage, reasonGatedAccount, closeReasonModal } =
    useStageTransition();
  const qc = useQueryClient();

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  // Open stage-history rows give "days in stage". Same two-read shape and
  // newest-open-row rule the old usePipelineHygiene used, but unfiltered by stage —
  // this view needs the post-close stages too.
  const historyQuery = useQuery({
    queryKey: ['money-view', 'stage-entered', orgId] as const,
    enabled: !!orgId,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await db
        .from('account_stage_history')
        .select('account_id, entered_at')
        .eq('organization_id', orgId!)
        .is('exited_at', null);
      if (error) throw error;
      const entered: Record<string, string> = {};
      for (const h of data ?? []) {
        if (!h.account_id || !h.entered_at) continue;
        const seen = entered[h.account_id];
        if (!seen || h.entered_at > seen) entered[h.account_id] = h.entered_at;
      }
      return entered;
    },
  });

  const rows = useMemo(
    () => buildMoneyRows(accounts, historyQuery.data ?? {}, hygieneRows),
    [accounts, historyQuery.data, hygieneRows],
  );

  const commitProjected = async (accountId: string, n: number) => {
    // Keep arr derived the same way useAccountFieldValue does when mrr is
    // edited elsewhere; otherwise the two columns disagree on other screens.
    await updateAccount(accountId, { mrr: n, arr: n * 12 });
    // missing_basics can flip when mrr goes from 0 to set.
    void qc.invalidateQueries({ queryKey: ['dashboard', 'hygiene-counters'] });
  };

  const commitNextStep = async (accountId: string, name: string, due: string | null) => {
    const acct = accountById.get(accountId);
    if (!acct || !orgId) return;
    // accounts.next_step/next_step_due are one-way mirrors of a tasks row
    // — writing them directly gets clobbered by the sync
    // trigger and skips the digest. Write through the task.
    if (acct.next_step_task_id) {
      const error = await updateTask(acct.next_step_task_id, { name, due_date: due });
      if (error) {
        toast.error(error.message || 'Failed to update next step');
        return;
      }
    } else {
      const { error } = await addTask({
        organization_id: orgId,
        account_id: accountId,
        name,
        due_date: due,
        status: 'todo',
        category: 'next_step',
        assign_to: acct.revenue_owner_id,
      });
      if (error) {
        toast.error(error.message || 'Failed to create next step');
        return;
      }
    }
    // The sync trigger rewrote the mirrors in the same statement — a refetch
    // sees fresh next_step/next_step_due (and, on insert, next_step_task_id).
    await Promise.all([
      qc.invalidateQueries({ queryKey: accountsListQueryKey(orgId) }),
      qc.invalidateQueries({ queryKey: ['dashboard', 'hygiene-counters'] }),
    ]);
  };

  if (historyQuery.isLoading || hygieneLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <BadgeDollarSign className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground max-w-sm">
          Nothing near the money right now — no deals between Qualified Opp. and
          go-live. Work the funnel above.
        </p>
      </div>
    );
  }

  const projectedTotal = rows.reduce((sum, r) => sum + r.projectedMonthly, 0);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Bottom of the funnel first, biggest projected MRR first ·{' '}
        <span className="tabular-nums">{money(projectedTotal)}</span>/mo projected across{' '}
        {rows.length} {rows.length === 1 ? 'deal' : 'deals'}. Work the red line before
        anything else today.
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left  font-medium text-xs uppercase tracking-wide text-muted-foreground py-2 px-3">Deal</th>
              <th className="text-left  font-medium text-xs uppercase tracking-wide text-muted-foreground py-2 px-3">Stage</th>
              <th className="text-right font-medium text-xs uppercase tracking-wide text-muted-foreground py-2 px-3 whitespace-nowrap">Projected /mo</th>
              <th className="text-right font-medium text-xs uppercase tracking-wide text-muted-foreground py-2 px-3 whitespace-nowrap">Days in stage</th>
              <th className="text-left  font-medium text-xs uppercase tracking-wide text-muted-foreground py-2 px-3">Next step</th>
              <th className="text-right font-medium text-xs uppercase tracking-wide text-muted-foreground py-2 px-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const meta = STATUS_META[r.status];
              const acct = accountById.get(r.id);
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-3">
                    <Link
                      to={`/account/${r.id}`}
                      className="group inline-flex items-center gap-1.5 font-medium hover:underline"
                    >
                      {r.name}
                      <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">
                    <StageCell
                      stage={r.stage}
                      onChange={(next) => {
                        if (acct) void requestStageChange(acct, next);
                      }}
                    />
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                    <ProjectedCell
                      mrr={acct?.mrr ?? 0}
                      display={r.projectedMonthly > 0 ? money(r.projectedMonthly) : '—'}
                      onCommit={(n) => void commitProjected(r.id, n)}
                    />
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                    {r.daysInStage ?? '—'}
                  </td>
                  <td className="py-2 px-3 max-w-64">
                    <NextStepCell
                      nextStep={r.nextStep}
                      nextStepDue={r.nextStepDue}
                      onCommit={(name, due) => void commitNextStep(r.id, name, due)}
                    />
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span
                      title={r.statusDetail ?? undefined}
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
                        meta.className,
                      )}
                    >
                      {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <StageReasonModal
        open={!!reasonGatedStage}
        onOpenChange={(o) => {
          if (!o) closeReasonModal();
        }}
        account={reasonGatedAccount}
        stage={reasonGatedStage}
      />
    </div>
  );
}
