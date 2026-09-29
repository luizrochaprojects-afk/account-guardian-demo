import { useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { QualificationChecklist, getAnsweredCount, QUALIFICATION_ITEM_COUNT } from './QualificationChecklist';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { transitionStage, type LossReasonCategory } from '@/lib/transitionStage';
import { LOSS_REASONS } from '@/lib/stageReasons';
import type { Account } from '@/contexts/AccountsContext';
import type { Json } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account;
}

/**
 * Founder review of a deal leaving discovery: grant the qualified opportunity,
 * or veto it into Closed Lost with a reason. Granting goes through
 * `transition_stage`, so the checklist gates apply here too.
 */
export function SalApprovalModal({ open, onOpenChange, account }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [vetoOpen, setVetoOpen] = useState(false);
  const [reason, setReason] = useState<LossReasonCategory | ''>('');
  const [detail, setDetail] = useState('');

  const checklist: Json | null | undefined = account.qualification_checklist;

  const handleGrantSal = async () => {
    setBusy(true);
    try {
      await transitionStage(account.id, 'qualified_opportunity');
      toast.success(`Qualified opportunity granted for ${account.name}`);
      await qc.invalidateQueries({ queryKey: ['accounts'] });
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Qualification failed');
    } finally {
      setBusy(false);
    }
  };

  const handleVeto = async () => {
    if (!reason) {
      toast.error('Loss reason is required');
      return;
    }
    setBusy(true);
    try {
      await transitionStage(account.id, 'closed_lost', {
        loss_reason_category: reason,
        loss_reason_detail: detail.trim() || undefined,
      });
      toast.success(`${account.name} marked Closed Lost`);
      await qc.invalidateQueries({ queryKey: ['accounts'] });
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Veto failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Founder approval — {account.name}</DialogTitle>
          <DialogDescription>
            Review the qualification before granting the qualified opportunity. Vetoing files
            this as Closed Lost with the reason you select.
          </DialogDescription>
        </DialogHeader>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium">Qualification checklist</h3>
            <Badge variant="outline">{getAnsweredCount(checklist)}/{QUALIFICATION_ITEM_COUNT}</Badge>
          </div>
          <QualificationChecklist checklist={checklist} />
        </div>

        {vetoOpen && (
          <div className="space-y-2 border-t pt-3">
            <Label htmlFor="loss-reason">Loss reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as LossReasonCategory)}>
              <SelectTrigger id="loss-reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {LOSS_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label htmlFor="loss-detail">Detail (optional)</Label>
            <Textarea
              id="loss-detail"
              rows={2}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Anything specific worth remembering"
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          {!vetoOpen ? (
            <>
              <Button variant="outline" onClick={() => setVetoOpen(true)} disabled={busy}>
                Veto…
              </Button>
              <Button onClick={handleGrantSal} disabled={busy}>
                Grant Qualified Opp.
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setVetoOpen(false)} disabled={busy}>
                Back
              </Button>
              <Button variant="destructive" onClick={handleVeto} disabled={busy || !reason}>
                Mark Closed Lost
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
