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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { transitionStage, type PipelineStage } from '@/lib/transitionStage';
import { stageLabel } from '@/lib/pipelineStages';
import { PIN_TTL_DAYS } from '@/lib/customerSignals';
import type { Account } from '@/contexts/AccountsContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account | null;
  stage: PipelineStage | null;
}

/**
 * Collects the justification required when a person overrides the classifier on
 * the Customer board.
 *
 * Why this exists at all: in SDR/Sales/Onboarding a human moving a card IS the
 * process. In the Customer phase the process is `classify_customer_stages()`,
 * running nightly off usage, activity and health. A drag here is an
 * exception to an automated decision, and `transition_stage` rejects the move
 * outright without `metadata.pin_reason` — so this modal is not a nicety, it is
 * the only legal path.
 *
 * The pin expires after PIN_TTL_DAYS. A pin without an expiry is how a board
 * ends up with an account frozen in a column nobody remembers choosing.
 *
 * `churned` does NOT come through here — it is reason-gated and goes to
 * StageReasonModal, which collects a churn_reason instead.
 */
export function StagePinModal({ open, onOpenChange, account, stage }: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setReason('');
  }, [open, account?.id, stage]);

  if (!stage || !account) return null;

  const handleConfirm = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error('A reason is required to override the classifier');
      return;
    }
    setBusy(true);
    try {
      // pin_reason is read by transition_stage, which stamps
      // customer_stage_pinned_at/_by/_reason in the same statement.
      await transitionStage(account.id, stage, { pin_reason: trimmed });
      toast.success(
        `"${account.name}" pinned to ${stageLabel(stage)} for ${PIN_TTL_DAYS} days`,
      );
      await qc.invalidateQueries({ queryKey: ['accounts'] });
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
          <DialogTitle>
            Move {account.name} to {stageLabel(stage)}
          </DialogTitle>
          <DialogDescription>
            This column is set automatically from usage, activity and health.
            Say why you're overriding it — the pin holds for {PIN_TTL_DAYS} days,
            then the classifier takes over again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="pin-reason">Reason</Label>
          <Textarea
            id="pin-reason"
            rows={3}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer told us they're pausing until September — not churn"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={busy || !reason.trim()}>
            Pin to {stageLabel(stage)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
