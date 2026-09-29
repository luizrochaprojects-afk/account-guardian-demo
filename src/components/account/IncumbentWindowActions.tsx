import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * The three ways out of an incumbent-window task.
 *
 * Presentational on purpose: the effects are injected, so the branching that
 * matters (discard is gated on a reason) is testable without a database, and
 * the caller owns which stage a reopen lands on.
 */

interface Props {
  accountId: string | null;
  onReopen: () => void | Promise<void>;
  onSnooze: (days: number) => void | Promise<void>;
  onDiscard: (reason: string) => void | Promise<void>;
}

export function IncumbentWindowActions({
  accountId,
  onReopen,
  onSnooze,
  onDiscard,
}: Props) {
  const [discarding, setDiscarding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!accountId) return null;

  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-1 space-y-2">
      <p className="text-[10px] font-medium text-muted-foreground/70">
        Renewal window
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() => void run(onReopen)}
        >
          Reopen account
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() => void run(() => onSnooze(30))}
        >
          Push out 30 days
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() => void run(() => onSnooze(90))}
        >
          Push out 90 days
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() => setDiscarding((d) => !d)}
        >
          Discard
        </Button>
      </div>

      {/* A reason is required here, and it is the whole point: without one the
          same account comes back next cycle with no record of why it was
          dismissed, and the queue stops being trusted. */}
      {discarding && (
        <div className="space-y-1.5 rounded-sm border border-border p-2.5">
          <Label htmlFor="incumbent-discard-reason" className="text-xs">
            Why is this window never worth opening again?
          </Label>
          <Input
            id="incumbent-discard-reason"
            className="h-7 text-xs"
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Moved off CRM entirely, acquired, out of business, ..."
          />
          <div className="flex items-center gap-2 pt-0.5">
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              disabled={busy || !reason.trim()}
              onClick={() => void run(() => onDiscard(reason.trim()))}
            >
              Confirm discard
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => {
                setDiscarding(false);
                setReason('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
