import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarIcon, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatDate } from '@/lib/formatDate';
import {
  extractStage,
  getEditBounds,
  getInsertBounds,
  isWithinBounds,
  type LifecycleEventLike,
} from '@/lib/lifecycle';
import { useLifecycleHistory } from '@/hooks/useLifecycleHistory';

type Mode =
  | { kind: 'edit'; eventId: string }
  | { kind: 'insert'; insertBeforeId: string | null };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountCreatedAt?: string | null;
  history: LifecycleEventLike[];
  stageOptions: string[];
  mode: Mode;
}

export function EditLifecycleEventDialog({
  open, onOpenChange, accountId, accountCreatedAt, history, stageOptions, mode,
}: Props) {
  const { updateLifecycleEvent, insertLifecycleEvent, deleteLifecycleEvent } =
    useLifecycleHistory(accountId);

  const isEdit = mode.kind === 'edit';
  const event = isEdit
    ? history.find(e => e.id === (mode as { kind: 'edit'; eventId: string }).eventId)
    : null;

  const bounds = useMemo(() => {
    if (isEdit && event) {
      return getEditBounds(history, event.id, accountCreatedAt);
    }
    return getInsertBounds(
      history,
      (mode as { kind: 'insert'; insertBeforeId: string | null }).insertBeforeId,
      accountCreatedAt
    );
  }, [isEdit, event, history, mode, accountCreatedAt]);

  const [date, setDate] = useState<Date | undefined>(undefined);
  const [note, setNote] = useState('');
  const [stage, setStage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isEdit && event) {
      setDate(parseISO(event.created_at));
      setNote(event.summary || '');
      setStage(extractStage(event.title));
    } else {
      // Sensible default: midpoint between bounds, or now
      const fallback = bounds.max ?? new Date();
      const seed = bounds.min && bounds.max
        ? new Date((bounds.min.getTime() + bounds.max.getTime()) / 2)
        : fallback;
      setDate(seed);
      setNote('');
      setStage(stageOptions[0] || '');
    }
  }, [open, isEdit, event, bounds.min?.getTime(), bounds.max?.getTime(), stageOptions]);

  const error = useMemo(() => {
    if (!date) return 'Pick a date';
    if (!isWithinBounds(date, bounds)) {
      const minLabel = bounds.min ? formatDate(bounds.min) : null;
      const maxLabel = bounds.max ? formatDate(bounds.max) : null;
      if (minLabel && maxLabel) return `Must be between ${minLabel} and ${maxLabel}`;
      if (minLabel) return `Must be after ${minLabel}`;
      if (maxLabel) return `Must be before ${maxLabel}`;
    }
    if (!isEdit && !stage) return 'Pick a stage';
    return null;
  }, [date, bounds, isEdit, stage]);

  const handleSave = async () => {
    if (error || !date) return;
    setSubmitting(true);
    try {
      if (isEdit && event) {
        await updateLifecycleEvent(event.id, { date, note });
        toast.success('Stage transition updated');
      } else {
        await insertLifecycleEvent({ stage, date, note });
        toast.success(`Backfilled "${stage}"`);
      }
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit || !event) return;
    if (!confirm('Delete this stage transition? If it is the most recent transition, the account stage will revert to the previous one.')) return;
    setSubmitting(true);
    try {
      await deleteLifecycleEvent(event.id);
      toast.success('Transition deleted');
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit stage transition' : 'Backfill stage transition'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Adjust when "${extractStage(event?.title || '')}" actually started.`
              : 'Add a stage change you forgot to log on the day it happened.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!isEdit && (
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="h-8 text-sm mt-1">
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {stageOptions.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isEdit && (
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Stage</Label>
              <div className="mt-1 px-2 py-1.5 text-sm border rounded-sm bg-muted/30">
                {extractStage(event?.title || '')}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs font-medium text-muted-foreground">Entered on</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'w-full justify-start mt-1 h-8 text-sm font-normal',
                    !date && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {date ? format(date, 'MMM d, yyyy') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => { if (d) { setDate(d); setCalendarOpen(false); } }}
                  disabled={(d) => {
                    if (bounds.min && d.getTime() <= bounds.min.getTime()) return true;
                    if (bounds.max && d.getTime() >= bounds.max.getTime()) return true;
                    return false;
                  }}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
            <div className="text-[10px] text-muted-foreground mt-1">
              {bounds.min && <>After {formatDate(bounds.min)}</>}
              {bounds.min && bounds.max && ' · '}
              {bounds.max && <>Before {formatDate(bounds.max)}</>}
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground">
              Note <span className="text-muted-foreground/60">(optional)</span>
            </Label>
            <Textarea
              className="text-sm mt-1 min-h-[60px]"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Why this stage at this time?"
            />
          </div>

          {error && (
            <div className="text-xs text-destructive">{error}</div>
          )}
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          {isEdit ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={submitting}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!!error || submitting}>
              {isEdit ? 'Save' : 'Backfill'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}