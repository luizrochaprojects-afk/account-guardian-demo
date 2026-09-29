// What is blocking this account from advancing one stage, ready for the UI.
//
// Thin wrapper over the pure `stageReadiness` in src/lib/stageReadiness.ts: it
// only supplies the contacts, which the closed_won gate needs and which the
// account row does not carry. Everything else the pure function already has.
//
// Contacts come from useContactsDB, the same cache DealCoverageSection writes
// through, so marking a decision maker as engaged clears the blocker without a
// refetch or a reload — which is the behaviour the signal is supposed to have.

import { useMemo } from 'react';
import { useContactsDB } from '@/hooks/useContactsDB';
import { stageReadiness, type ReadinessAccount, type StageReadiness } from '@/lib/stageReadiness';

export function useStageReadiness(account: ReadinessAccount & { id: string }): StageReadiness {
  const { contacts } = useContactsDB(account.id);

  return useMemo(
    () => stageReadiness(account, contacts),
    // The account fields the gates actually read. Listing them instead of the
    // whole object keeps this from recomputing on every unrelated account edit,
    // and keeps it recomputing on every relevant keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      account.pipeline_stage,
      account.mrr,
      account.qualification_checklist,
      account.first_usage_at,
      contacts,
    ],
  );
}
