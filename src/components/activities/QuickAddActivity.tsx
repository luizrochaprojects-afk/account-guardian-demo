import { useState, type ReactNode } from 'react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useActivities } from '@/hooks/useActivities';
import { useAccounts } from '@/contexts/AccountsContext';
import {
  CHANNEL_OPTIONS, KIND_OPTIONS, OUTCOME_OPTIONS, kindByType, outcomeValue,
  type ActivityChannel, type ActivityType,
} from '@/lib/activityOptions';

interface Props {
  /** When provided, the activity is scoped to this account and no picker shows. */
  accountId?: string;
  accountName?: string;
  contactId?: string | null;
  /** Uncontrolled usage: render this trigger. */
  trigger?: ReactNode;
  /** Controlled usage (e.g. from the command palette): drive open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Quick-add activity — the most-used surface of the whole sales workflow.
 * Design rule: logging a touch must cost < ~10s, so it's three fast selects
 * (channel, kind, outcome) with the outcome pre-filled from the kind, and the
 * timestamp defaulting to now. Direction is inferred from the kind.
 *
 * Works two ways: scoped to a fixed account (pipeline card, account tab) or with
 * an account picker (command palette, controlled open).
 */
export function QuickAddActivity({
  accountId, accountName, contactId, trigger, open, onOpenChange,
}: Props) {
  const { accounts } = useAccounts();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const dialogOpen = isControlled ? open : internalOpen;

  const [pickedAccount, setPickedAccount] = useState<string>('');
  const [channel, setChannel] = useState<ActivityChannel>('whatsapp');
  const [kind, setKind] = useState<ActivityType>('outreach');
  const [outcome, setOutcome] = useState<string>('no_response');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const effectiveAccountId = accountId ?? pickedAccount;
  const { logActivity } = useActivities(effectiveAccountId || undefined);

  const reset = () => {
    setPickedAccount('');
    setChannel('whatsapp');
    setKind('outreach');
    setOutcome('no_response');
    setNotes('');
  };

  const setOpen = (o: boolean) => {
    if (!isControlled) setInternalOpen(o);
    onOpenChange?.(o);
    if (!o) reset();
  };

  // Changing the kind re-defaults the outcome (still editable afterwards).
  const onKindChange = (value: string) => {
    const k = kindByType(value as ActivityType);
    setKind(k.value);
    setOutcome(k.defaultOutcome);
  };

  const submit = async () => {
    if (!effectiveAccountId) {
      toast.error('Pick an account first');
      return;
    }
    setSaving(true);
    try {
      const k = kindByType(kind);
      const { error } = await logActivity({
        account_id: effectiveAccountId,
        contact_id: contactId ?? null,
        channel,
        activity_type: kind,
        direction: k.direction,
        outcome: outcomeValue(outcome),
        notes: notes.trim() || null,
      });
      if (error) throw error;
      toast.success('Activity logged');
      setOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't log the activity.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className="max-w-sm"
        onKeyDown={(e) => {
          // Enter anywhere (except the notes textarea) submits — keeps it fast.
          if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
            if (!saving) submit();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Log activity{accountName ? ` · ${accountName}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!accountId && (
            <div>
              <Label>Account</Label>
              <Select value={pickedAccount} onValueChange={setPickedAccount}>
                <SelectTrigger><SelectValue placeholder="Pick an account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as ActivityChannel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kind</Label>
              <Select value={kind} onValueChange={onKindChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OUTCOME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="activity_notes">Notes (optional)</Label>
            <Textarea
              id="activity_notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Short context — Shift+Enter for a new line"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Log'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
