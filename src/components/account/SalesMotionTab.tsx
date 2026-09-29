import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SalApprovalModal } from './SalApprovalModal';
import {
  QualificationChecklist,
  QUALIFICATION_ITEM_COUNT,
  cycleChecklistAnswer,
  getAnsweredCount,
} from './QualificationChecklist';
import { DealCoverageSection } from './DealCoverageSection';
import { IncumbentBlock } from './IncumbentBlock';
import {
  toIncumbentDraft,
  toIncumbentPatch,
  CLEARED_INCUMBENT_PATCH,
} from '@/lib/incumbentAccount';
import type { IncumbentDraft } from '@/lib/incumbentWindow';
import { useDiscoveryNotes } from '@/hooks/useDiscoveryNotes';
import { useRole } from '@/hooks/useRole';
import { useAccounts } from '@/contexts/AccountsContext';
import { useStageReadiness } from '@/hooks/useStageReadiness';
import type { Account } from '@/contexts/AccountsContext';

interface Props {
  account: Account;
}

/**
 * What's here is content that doesn't exist anywhere else on the account page:
 * the qualification checklist, deal coverage, incumbent/displacement tracking,
 * discovery notes, and the founder approval flow. Stage, expected close, ARR
 * and owner live elsewhere on the page and are deliberately not repeated here.
 */
export function SalesMotionTab({ account }: Props) {
  const { notes, isLoading: notesLoading } = useDiscoveryNotes(account.id);
  const { isFounder } = useRole();
  const readiness = useStageReadiness(account);
  const { updateAccount } = useAccounts();

  const [salOpen, setSalOpen] = useState(false);

  const canRequestSal = account.pipeline_stage === 'discovery_call';

  return (
    <div className="space-y-4">
      {/* The approval card renders only when the founder can act on it: a
          deal in discovery, one decision away from qualified. */}
      {isFounder && canRequestSal && (
        <SectionCard
          title="Sales motion"
          action={<Button size="sm" onClick={() => setSalOpen(true)}>Review &amp; qualify</Button>}
        >
          <p className="text-xs text-muted-foreground">
            Discovery is done. Granting Qualified Opp. requires every checklist
            item answered, and the three marked "must be yes" answered yes.
          </p>
        </SectionCard>
      )}

      <SectionCard
        title="Qualification"
        action={
          <span className="text-xs text-muted-foreground tabular-nums">
            {getAnsweredCount(account.qualification_checklist)}/{QUALIFICATION_ITEM_COUNT} answered
          </span>
        }
      >
        <QualificationChecklist
          checklist={account.qualification_checklist}
          onAnswer={(key) =>
            updateAccount(account.id, {
              qualification_checklist: cycleChecklistAnswer(account.qualification_checklist, key),
            } as Partial<Account>)
          }
        />
      </SectionCard>

      <SectionCard title="Deal coverage">
        <DealCoverageSection accountId={account.id} readiness={readiness} />
      </SectionCard>

      <SectionCard title="Incumbent">
        <IncumbentSection account={account} />
      </SectionCard>

      <SectionCard title={notesLoading ? 'Discovery notes' : `Discovery notes (${notes.length})`}>
        {notesLoading ? (
          <div role="status" aria-live="polite" className="space-y-2.5">
            <span className="sr-only">Loading discovery notes</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : notes.length === 0 ? (
          <EmptyState
            compact
            title="No discoveries logged yet."
            description="Notes are extracted from discovery calls by the agent."
          />
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="border-l-2 pl-3">
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  {n.generated_by !== 'human' && (
                    <span className="ml-2 italic">agent-extracted</span>
                  )}
                </div>
                <div className="text-sm mt-1">
                  <span className="font-medium">Pain:</span> {n.primary_pain ?? 'Not noted'}
                </div>
                {n.fit_thesis && (
                  <div className="text-sm">
                    <span className="font-medium">Fit:</span> {n.fit_thesis}
                  </div>
                )}
                {n.risk_thesis && (
                  <div className="text-sm">
                    <span className="font-medium">Risk:</span> {n.risk_thesis}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SalApprovalModal
        open={salOpen}
        onOpenChange={setSalOpen}
        account={account}
      />
    </div>
  );
}

/**
 * The editable home of the incumbent record.
 *
 * Explicit save rather than the save-on-blur used by the Commercial rows above:
 * the four fields only make sense together (a vendor without an anchor produces
 * no window, an anchor without a cycle produces nothing at all), so committing
 * them one keystroke at a time would write states no one intended and stamp
 * `incumbent_source` off a half-filled form.
 */
function IncumbentSection({ account }: { account: Account }) {
  const { updateAccount } = useAccounts();
  const saved = toIncumbentDraft(account);
  const [draft, setDraft] = useState<IncumbentDraft>(saved);
  const [busy, setBusy] = useState(false);

  // Reseed when the row changes underneath us, e.g. an agent suggestion was
  // approved in another surface while this tab was open.
  useEffect(() => {
    setDraft(toIncumbentDraft(account));
    // Depending on `account` itself would reseed on every new object identity
    // from the accounts query and wipe the draft mid-edit. The saved fields are
    // exactly what should trigger a reseed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    account.id,
    account.incumbent_vendor,
    account.incumbent_last_renewal,
    account.incumbent_cycle,
    account.incumbent_evidence,
  ]);

  const dirty =
    draft.vendor !== saved.vendor ||
    draft.lastRenewal !== saved.lastRenewal ||
    draft.cycle !== saved.cycle ||
    draft.evidence !== saved.evidence;

  const handleSave = async () => {
    setBusy(true);
    try {
      const patch = toIncumbentPatch(draft, 'human', new Date());
      await updateAccount(
        account.id,
        (Object.keys(patch).length ? patch : CLEARED_INCUMBENT_PATCH) as Partial<Account>,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <IncumbentBlock value={draft} onChange={setDraft} />
      {dirty && (
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={busy}>
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setDraft(saved)}
            disabled={busy}
          >
            Discard changes
          </Button>
        </div>
      )}
    </div>
  );
}
