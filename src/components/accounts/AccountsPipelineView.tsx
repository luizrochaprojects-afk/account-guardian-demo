import { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { PipelineColumn } from './PipelineColumn';
import { StageReasonModal } from './StageReasonModal';
import { StagePinModal } from './StagePinModal';
import { CustomerPhaseHeader } from './CustomerPhaseHeader';
import { PipelineCardFieldsProvider } from './PipelineCardFieldsContext';
import { PipelineCardFieldsMenu } from './PipelineCardFieldsMenu';
import { useCustomerSignals } from '@/hooks/useCustomerSignals';
import { Button } from '@/components/ui/button';
import { transitionStage, type PipelineStage } from '@/lib/transitionStage';
import { ALL_STAGES, PIPELINE_PHASES, phaseForStage } from '@/lib/pipelinePhases';
import { isReasonGated, type ReasonGatedStage } from '@/lib/stageReasons';
import { customerRiskRank } from '@/lib/pipelineStages';
import { useRole } from '@/hooks/useRole';
import { useProfile } from '@/hooks/useProfile';
import { useMoney } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';
import { useAccounts, type Account } from '@/contexts/AccountsContext';

type Phase = 'sdr' | 'sales' | 'onboarding' | 'customer';

const PHASE_STORAGE_KEY = 'pipeline.phase';

function isPhase(v: string | null): v is Phase {
  return v === 'sdr' || v === 'sales' || v === 'onboarding' || v === 'customer';
}

interface Props {
  accounts: Account[];
}

// Deliberately unchanged for the Customer phase. Moving a card there
// is an override of a classifier, not an approval of a commitment — the three
// gated stages above all commit the company to something. The override is still
// attributable: transition_stage stamps customer_stage_pinned_by, and the pin
// expires after PIN_TTL_DAYS, so a bad call surfaces on its own.
const FOUNDER_ONLY_TARGETS: PipelineStage[] = ['qualified_opportunity', 'sign_off', 'closed_won'];

export default function AccountsPipelineView({ accounts }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { addAccount } = useAccounts();
  const { isFounder } = useRole();
  const { profile } = useProfile();
  const orgId = profile?.organization_id ?? null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Which pipeline is shown (one at a time). Persisted so it survives navigation.
  const [phase, setPhase] = useState<Phase>(() => {
    if (typeof window === 'undefined') return 'sdr';
    const saved = window.localStorage.getItem(PHASE_STORAGE_KEY);
    return isPhase(saved) ? saved : 'sdr';
  });
  useEffect(() => {
    try { window.localStorage.setItem(PHASE_STORAGE_KEY, phase); } catch { /* ignore */ }
  }, [phase]);

  const [hideEmpty, setHideEmpty] = useState(false);
  const { money } = useMoney();

  // Customer signals feed the phase header and the dormant filter. One
  // org-wide query, deduped by react-query.
  const { byAccount: signalsByAccount, thresholds } = useCustomerSignals();

  // Set by the "Dormant" alert in CustomerPhaseHeader: narrows the board to the
  // customers that stopped using the product, so the alert is a way in and not
  // just a number to look at.
  const [dormantFilter, setDormantFilter] = useState(false);

  const grouped = useMemo(() => {
    const m = Object.fromEntries(
      ALL_STAGES.map((s) => [s.key, [] as Account[]]),
    ) as Record<PipelineStage, Account[]>;
    for (const a of accounts) {
      const k = (a.pipeline_stage ?? 'target') as PipelineStage;
      if (!m[k]) continue;
      if (dormantFilter && phaseForStage(k) === 'customer') {
        const weeks = signalsByAccount.get(a.id)?.weeksSinceLastUsage;
        // null means "not computable", which is not the same as "fine" — but it
        // is also not evidence of dormancy, so it stays out of the filter.
        if (weeks === null || weeks === undefined || weeks < thresholds.dormantWeeks) continue;
      }
      m[k].push(a);
    }

    // At Risk is the only column with a meaningful reading order: severity
    // first (H1→H2→H3→S1, the order the classifier evaluates its rules), then
    // biggest MRR, because losing a large customer hurts more.
    // Every other column keeps the incoming order — imposing one would imply a
    // ranking that does not exist.
    m.at_risk?.sort((a, b) => {
      const bySeverity =
        customerRiskRank(a.customer_risk_reason) - customerRiskRank(b.customer_risk_reason);
      if (bySeverity !== 0) return bySeverity;
      return (Number(b.mrr) || 0) - (Number(a.mrr) || 0);
    });

    return m;
  }, [accounts, dormantFilter, signalsByAccount, thresholds.dormantWeeks]);

  // Per-phase count + potential-ARR sum, for the tab labels and the summary line.
  //
  // Deliberately NOT extended with an aggregate customer total: the Customer phase's
  // money line comes from `summarizeCustomerPortfolio`, which is unit-tested and
  // handles the retention denominators. A second sum here would be a duplicate
  // formula free to drift from the tested one — the exact failure mode the
  // header comment in pipelineStages.ts was written about.
  const phaseStats = useMemo(() => {
    const stats = {} as Record<Phase, { count: number; arr: number }>;
    for (const p of PIPELINE_PHASES) {
      let count = 0;
      let arr = 0;
      for (const s of p.stages) {
        const bucket = grouped[s.key] ?? [];
        count += bucket.length;
        for (const a of bucket) arr += Number(a.arr) || 0;
      }
      stats[p.phase] = { count, arr };
    }
    return stats;
  }, [grouped]);

  const activePhase = PIPELINE_PHASES.find((p) => p.phase === phase) ?? PIPELINE_PHASES[0];
  const visibleStages = hideEmpty
    ? activePhase.stages.filter((s) => (grouped[s.key]?.length ?? 0) > 0)
    : activePhase.stages;

  // Pending reason-gated move awaiting a reason in the modal.
  const [reasonMove, setReasonMove] = useState<{ account: Account; stage: ReasonGatedStage } | null>(null);

  // Pending Customer-phase override awaiting a justification.
  const [pinMove, setPinMove] = useState<{ account: Account; stage: PipelineStage } | null>(null);

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const accountId = event.active.id as string;
      const newStage = event.over?.id as PipelineStage | undefined;
      if (!newStage) return;
      const account = accounts.find((a) => a.id === accountId);
      if (!account || account.pipeline_stage === newStage) return;

      if (!isFounder && FOUNDER_ONLY_TARGETS.includes(newStage)) {
        toast.warning('This transition requires founder approval — request sent to Inbox');
        return;
      }

      // Terminal stages that require a reason: collect it before transitioning.
      if (isReasonGated(newStage)) {
        setReasonMove({ account, stage: newStage });
        return;
      }

      // Customer phase: the classifier owns these columns, so a drag is an
      // override. transition_stage REJECTS the move without metadata.pin_reason
      //, which makes this branch mandatory, not decorative.
      if (phaseForStage(newStage) === 'customer') {
        setPinMove({ account, stage: newStage });
        return;
      }

      try {
        await transitionStage(accountId, newStage);
        toast.success(`Moved "${account.name}" to ${newStage}`);
        await qc.invalidateQueries({ queryKey: ['accounts'] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Stage change failed';
        toast.error(msg);
      }
    },
    [accounts, isFounder, orgId, qc],
  );

  /**
   * Inline quick-create straight into a column's stage. The INSERT path is the
   * only legal way to set `pipeline_stage` without the `transition_stage` RPC
   * (`guard_accounts_pipeline_stage` is BEFORE UPDATE only), and the CSV
   * importer already relies on it.
   *
   * Deliberately sends name + stage only — none of the Add Account dialog's
   * hardcoded defaults (segment 'SMB', 'Mike Torres', …), which would stamp
   * fiction onto every board-created account. Returns whether it succeeded so
   * the composer can stay open for the next one.
   */
  const createInStage = useCallback(
    async (stage: PipelineStage, label: string, name: string) => {
      const created = await addAccount({ name, lifecycleStage: stage });
      // addAccount returns null instead of throwing — the null check is the
      // only error signal (same contract as AllAccounts' handleSave).
      if (!created) {
        toast.error("Couldn't create the account. Please try again.");
        return false;
      }
      toast.success(`"${created.name}" added to ${label}`, {
        action: { label: 'View details', onClick: () => navigate(`/account/${created.id}`) },
      });
      return true;
    },
    [addAccount, navigate],
  );

  const summary = phaseStats[phase];

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {/* `key={phase}` is load-bearing: the provider hydrates its localStorage
          prefs once per mount, so a phase switch has to remount it or the new
          phase silently inherits the previous phase's card-field selection. */}
      <PipelineCardFieldsProvider key={phase} phase={phase} orgId={orgId}>
      <div data-tour="board" className="flex-1 min-h-0 flex flex-col">
        {/* Header: one line — phase switcher (label + count) left, phase ARR + hide-empty right.
            The tabs already carry the active phase's name and count, so no separate heading. */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 border-b border-subtle">
          <div role="tablist" aria-label="Pipeline phase" className="inline-flex">
            {PIPELINE_PHASES.map((p) => {
              const active = p.phase === phase;
              return (
                <button
                  key={p.phase}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPhase(p.phase)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border-y border-l transition-colors first:rounded-l-md last:rounded-r-md last:border-r',
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-input hover:bg-accent',
                  )}
                >
                  <span className="font-medium">{p.label}</span>
                  <span className={cn('text-xs tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    {phaseStats[p.phase].count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <PipelineCardFieldsMenu />
            {/* Potential ARR answers "how big could this deal be?" — a question
                that stops being meaningful the moment the deal closes. The
                Customer phase gets usage and retention instead. */}
            {phase === 'customer' ? (
              <CustomerPhaseHeader
                onFilterDormant={() => setDormantFilter((v) => !v)}
              />
            ) : (
              summary.arr > 0 && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {money(summary.arr)} potential ARR
                </span>
              )
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground shrink-0"
              onClick={() => setHideEmpty((v) => !v)}
            >
              {hideEmpty ? <Eye className="h-3.5 w-3.5 mr-1" /> : <EyeOff className="h-3.5 w-3.5 mr-1" />}
              {hideEmpty ? 'Show all stages' : 'Hide empty stages'}
            </Button>
          </div>
        </div>

        {/* Board: one phase at a time — fills the viewport, scrolls horizontally.
            Vertical scrolling happens inside each column's card list. */}
        <div className="flex-1 min-h-0 overflow-x-auto flex gap-3 px-4 py-3">
          {visibleStages.map(({ key, label }) => (
            <PipelineColumn
              key={key}
              stage={key}
              label={label}
              accounts={grouped[key]}
              onQuickCreate={
                phase === 'customer' ? undefined : (name) => createInStage(key, label, name)
              }
              usageTotal={
                phase === 'customer'
                  ? (grouped[key] ?? []).reduce(
                      (sum, a) => sum + (signalsByAccount.get(a.id)?.usage4w ?? 0),
                      0,
                    )
                  : undefined
              }
            />
          ))}
          {visibleStages.length === 0 && (
            <div className="text-sm text-muted-foreground py-8">
              Every stage in this pipeline is empty.
            </div>
          )}
        </div>
      </div>
      </PipelineCardFieldsProvider>

      <StageReasonModal
        open={!!reasonMove}
        onOpenChange={(o) => { if (!o) setReasonMove(null); }}
        account={reasonMove?.account ?? null}
        stage={reasonMove?.stage ?? null}
      />

      <StagePinModal
        open={!!pinMove}
        onOpenChange={(o) => { if (!o) setPinMove(null); }}
        account={pinMove?.account ?? null}
        stage={pinMove?.stage ?? null}
      />
    </DndContext>
  );
}
