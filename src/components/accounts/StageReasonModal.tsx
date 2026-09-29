import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  transitionStage,
  type LossReasonCategory,
  type DisqualifyReason,
  type ChurnReason,
  type TransitionMetadata,
} from '@/lib/transitionStage';
import {
  STAGE_REASON_CONFIG,
  shouldPromptForIncumbent,
  type ReasonGatedStage,
} from '@/lib/stageReasons';
import { IncumbentBlock } from '@/components/account/IncumbentBlock';
import { toIncumbentDraft, toIncumbentPatch } from '@/lib/incumbentAccount';
import type { IncumbentDraft } from '@/lib/incumbentWindow';
import { useAccounts } from '@/contexts/AccountsContext';
import { useProfile } from '@/hooks/useProfile';
import type { Account } from '@/contexts/AccountsContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account | null;
  stage: ReasonGatedStage | null;
}

/**
 * Collects the reason required when moving an account to a reason-gated terminal
 * stage (disqualified / closed_lost / churned). The transition_stage RPC rejects
 * these moves without a reason, so the kanban opens this modal instead of
 * transitioning directly on drop.
 */
export function StageReasonModal({ open, onOpenChange, account, stage }: Props) {
  const qc = useQueryClient();
  const { profile } = useProfile();
  const orgId = profile?.organization_id ?? null;
  const { updateAccount } = useAccounts();
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [incumbent, setIncumbent] = useState<IncumbentDraft>(toIncumbentDraft(null));

  // Reset the form whenever the modal opens for a different account/stage.
  useEffect(() => {
    if (open) {
      setReason('');
      setDetail('');
      setIncumbent(toIncumbentDraft(account));
    }
    // Seeding is an open-time action, not a sync. Depending on `account` would
    // reset a half-typed incumbent every time the accounts query refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account?.id, stage]);

  if (!stage || !account) return null;
  const config = STAGE_REASON_CONFIG[stage];
  const askIncumbent = shouldPromptForIncumbent(stage, reason);

  const handleConfirm = async () => {
    if (!reason) {
      toast.error('A reason is required');
      return;
    }
    setBusy(true);
    try {
      const metadata: TransitionMetadata = {};
      if (detail.trim()) metadata.loss_reason_detail = detail.trim();
      if (config.metadataKey === 'loss_reason_category') {
        metadata.loss_reason_category = reason as LossReasonCategory;
      } else if (config.metadataKey === 'disqualify_reason') {
        metadata.disqualify_reason = reason as DisqualifyReason;
      } else {
        metadata.churn_reason = reason as ChurnReason;
      }

      await transitionStage(account.id, stage, metadata);

      // Save the incumbent after the transition, and never let it block the
      // transition: the rep came here to close the deal out, and losing that
      // action because an optional field failed would be the wrong trade.
      if (askIncumbent) {
        const patch = toIncumbentPatch(incumbent, 'human', new Date());
        if (Object.keys(patch).length) {
          await updateAccount(account.id, patch as Partial<typeof account>);
        }
      }

      toast.success(`"${account.name}" — ${config.actionLabel.toLowerCase()}`);

      // Same set as useStageTransition's happy path: days-in-stage and the
      // hygiene status pills shift on a transition, not just the accounts list.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['accounts'] }),
        qc.invalidateQueries({ queryKey: ['money-view'] }),
        qc.invalidateQueries({ queryKey: ['dashboard', 'hygiene-counters'] }),
      ]);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Stage change failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{config.title} — {account.name}</DialogTitle>
          <DialogDescription>
            Select a reason. It's required and recorded with the stage change.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="stage-reason">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="stage-reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {config.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stage-reason-detail">Detail (optional)</Label>
            <Textarea
              id="stage-reason-detail"
              rows={2}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Anything specific worth remembering"
            />
          </div>

          {/* The reason says someone else's contract is in the way. This is the
              one moment the rep has that context fresh and is already stopped,
              so ask here. Optional throughout: a blocked field would just get
              a junk answer, or block the close. */}
          {askIncumbent && (
            <div className="space-y-2 rounded-sm border border-border p-3">
              <div>
                <p className="text-xs font-medium">Who are they locked into?</p>
                <p className="text-[11px] text-muted-foreground">
                  Optional. Recording it schedules a task for when the renewal
                  window opens, so this account comes back on its own.
                </p>
              </div>
              <IncumbentBlock
                value={incumbent}
                onChange={setIncumbent}
                idPrefix="stage-reason-incumbent"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={busy || !reason}>
            {config.actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
