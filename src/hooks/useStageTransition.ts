import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { transitionStage, type PipelineStage } from '@/lib/transitionStage';
import { isReasonGated, type ReasonGatedStage } from '@/lib/stageReasons';
import { useRole } from '@/hooks/useRole';
import type { Account } from '@/contexts/AccountsContext';

// Stages that require founder approval before an account can move into them.
// Mirrors AccountsPipelineView's drag-and-drop gate so every stage-change
// surface (kanban drag, header "Move stage", Sales tab Stage select) enforces
// the same rule.
const FOUNDER_ONLY_TARGETS: PipelineStage[] = ['qualified_opportunity', 'sign_off', 'closed_won'];

/**
 * Shared stage-transition logic for UI surfaces outside the kanban board
 * (AccountHeader's "Move stage" menu, SalesMotionTab's Stage select). The DB
 * trigger `guard_accounts_pipeline_stage` forbids writing `pipeline_stage`
 * directly via `accounts.update` — the only sanctioned path is the
 * `transition_stage` RPC (see `src/lib/transitionStage.ts`), which also
 * enforces the founder gate for `qualified_opportunity`/`sign_off`/`closed_won`
 * and requires a reason for terminal stages (see `src/lib/stageReasons.ts`).
 *
 * Terminal, reason-gated stages are not transitioned immediately — the caller
 * renders `<StageReasonModal>` (from `src/components/accounts/StageReasonModal.tsx`)
 * keyed off `reasonGatedStage`/`reasonGatedAccount` to collect the reason first,
 * exactly like AccountsPipelineView does on drop.
 */
export function useStageTransition() {
  const qc = useQueryClient();
  const { isFounder } = useRole();
  const [reasonGatedStage, setReasonGatedStage] = useState<ReasonGatedStage | null>(null);
  const [reasonGatedAccount, setReasonGatedAccount] = useState<Account | null>(null);

  const requestStageChange = useCallback(
    async (account: Account, newStage: PipelineStage) => {
      if (account.pipeline_stage === newStage) return;

      if (!isFounder && FOUNDER_ONLY_TARGETS.includes(newStage)) {
        toast.warning('This transition requires founder approval — request sent to Inbox');
        return;
      }

      if (isReasonGated(newStage)) {
        setReasonGatedAccount(account);
        setReasonGatedStage(newStage);
        return;
      }

      try {
        await transitionStage(account.id, newStage);
        toast.success(`Moved "${account.name}" to ${newStage}`);
        // Beyond the accounts list: days-in-stage (money view's stage-history
        // query) and the hygiene status pills all shift on a transition.
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['accounts'] }),
          qc.invalidateQueries({ queryKey: ['money-view'] }),
          qc.invalidateQueries({ queryKey: ['dashboard', 'hygiene-counters'] }),
        ]);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Stage change failed');
      }
    },
    [isFounder, qc],
  );

  const closeReasonModal = useCallback(() => {
    setReasonGatedStage(null);
    setReasonGatedAccount(null);
  }, []);

  return { requestStageChange, reasonGatedStage, reasonGatedAccount, closeReasonModal };
}
