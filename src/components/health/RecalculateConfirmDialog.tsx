import { useEffect, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { db } from '@/demo/db';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { HealthMetric } from '@/lib/healthTypes';
import { recalculateForAccounts } from '@/lib/healthRecalculation';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-resolved impacted account ids (so the dialog can show the count) */
  accountIds: string[];
  profileId: string;
  profileName: string;
  metrics: HealthMetric[];
  /** Optional context label, e.g. "Pilot profile" or "stage remap". */
  contextLabel?: string;
}

export function RecalculateConfirmDialog({
  open,
  onOpenChange,
  accountIds,
  profileId,
  profileName,
  metrics,
  contextLabel,
}: Props) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: { user } } = await db.auth.getUser();
      setUserId(user?.id ?? null);
      const { data: oid } = await db.rpc('get_user_org_id');
      setOrgId(oid ?? null);
    })();
  }, [open]);

  const count = accountIds.length;

  const handleConfirm = async () => {
    if (!orgId || !userId) {
      toast.error('Could not determine your organization.');
      return;
    }
    setRunning(true);
    try {
      const res = await recalculateForAccounts({
        orgId,
        userId,
        profileId,
        profileName,
        metrics,
        accountIds,
      });
      const parts: string[] = [`Recalculated ${res.recalculated} ${res.recalculated === 1 ? 'account' : 'accounts'}.`];
      if (res.skipped) parts.push(`Skipped ${res.skipped} (no prior log).`);
      if (res.errors) parts.push(`${res.errors} failed.`);
      if (res.errors > 0) toast.error(parts.join(' '));
      else toast.success(parts.join(' '));
      qc.invalidateQueries({ queryKey: ['health_score_logs'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error('Recalculation failed.');
    }
    setRunning(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Recalculate health scores</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                This will rescore <span className="font-medium text-foreground">{count}</span> {count === 1 ? 'account' : 'accounts'}
                {contextLabel ? <> using the current <span className="font-medium text-foreground">{contextLabel}</span></> : null}
                {' '}and write a new log entry per account.
              </p>
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                <li>Past logs are preserved (read-only).</li>
                <li>Trend arrows compare the new log to the previous one.</li>
                <li>Accounts in the "Churned" stage are skipped.</li>
                <li>Accounts with no prior log are skipped.</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={running || count === 0}
            onClick={(e) => { e.preventDefault(); handleConfirm(); }}
          >
            {running ? 'Recalculating…' : 'Recalculate'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
