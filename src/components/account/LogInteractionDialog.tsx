import { useEffect, useMemo, useState } from 'react';
import { useEventsDB, type EventWithContacts } from '@/hooks/useEventsDB';
import { useContactsDB } from '@/hooks/useContactsDB';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { format, isFuture, parseISO } from 'date-fns';

interface LogInteractionDialogProps {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingEvent?: EventWithContacts | null;
  /** Pre-select these contacts for a fresh (non-editing) log — used by the
   * per-contact "Log interaction" quick action on the contacts table. */
  initialContactIds?: string[];
}

const CHANNEL_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'slack', label: 'Slack' },
  { value: 'email', label: 'Email' },
  { value: 'call', label: 'Call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'in_person', label: 'In Person' },
  { value: 'sms', label: 'SMS' },
  { value: 'other', label: 'Other' },
];

interface FormState {
  channel: string;
  direction: 'inbound' | 'outbound' | 'internal';
  title: string;
  summary: string;
  contactIds: string[];
  groupLabel: string;
  scheduledDate: string;
  isScheduled: boolean;
  sentiment: string | null;
}

const defaultForm: FormState = {
  channel: 'call',
  direction: 'outbound',
  title: '',
  summary: '',
  contactIds: [],
  groupLabel: '',
  scheduledDate: '',
  isScheduled: false,
  sentiment: null,
};

export const SENTIMENTS: { value: string; emoji: string; label: string }[] = [
  { value: 'very_positive', emoji: '😀', label: 'Very positive' },
  { value: 'positive', emoji: '🙂', label: 'Positive' },
  { value: 'neutral', emoji: '😐', label: 'Neutral' },
  { value: 'negative', emoji: '😕', label: 'Negative' },
  { value: 'very_negative', emoji: '😡', label: 'Very negative' },
];

function formFromEvent(e: EventWithContacts): FormState {
  const isScheduled = !!e.scheduled_at && isFuture(parseISO(e.scheduled_at)) && !e.completed_at;
  const sched = e.scheduled_at ? parseISO(e.scheduled_at) : null;
  return {
    channel: e.channel || e.type || 'call',
    direction: (e.direction as any) || 'outbound',
    title: e.title,
    summary: e.summary || '',
    contactIds: e.contact_ids || [],
    groupLabel: e.group_label || '',
    scheduledDate: sched ? format(sched, 'yyyy-MM-dd') : (e.date || ''),
    isScheduled,
    sentiment: (e as any).sentiment ?? null,
  };
}

export function LogInteractionDialog({ accountId, open, onOpenChange, editingEvent, initialContactIds }: LogInteractionDialogProps) {
  const { addEvent, updateEvent } = useEventsDB(accountId);
  const { contacts } = useContactsDB(accountId);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);

  const contactById = useMemo(
    () => Object.fromEntries(contacts.map(c => [c.id, c])),
    [contacts]
  );

  // Sync form state with the event being edited (or reset to defaults for a
  // fresh "log" flow) each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setForm(editingEvent
      ? formFromEvent(editingEvent)
      : { ...defaultForm, contactIds: initialContactIds ?? [] });
  }, [open, editingEvent, initialContactIds]);

  function handleOpenChange(o: boolean) {
    onOpenChange(o);
    if (!o) setForm(defaultForm);
  }

  async function handleSave() {
    if (!form.title.trim()) return;

    const scheduled_at = form.isScheduled && form.scheduledDate
      ? new Date(`${form.scheduledDate}T09:00`).toISOString()
      : null;

    const payload = {
      title: form.title.trim(),
      type: form.channel,
      channel: form.channel,
      direction: form.direction,
      summary: form.summary.trim() || null,
      group_label: form.contactIds.length > 1 ? (form.groupLabel.trim() || null) : null,
      account_id: accountId,
      scheduled_at,
      date: scheduled_at ? null : (form.scheduledDate || new Date().toISOString().split('T')[0]),
      time: null,
      sentiment: form.sentiment,
    };

    if (editingEvent) {
      await updateEvent(editingEvent.id, payload as any, form.contactIds);
    } else {
      await addEvent(payload as any, form.contactIds);
    }
    handleOpenChange(false);
  }

  function toggleContact(id: string) {
    setForm(f => ({
      ...f,
      contactIds: f.contactIds.includes(id)
        ? f.contactIds.filter(c => c !== id)
        : [...f.contactIds, id],
    }));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingEvent ? 'Edit interaction' : 'Log interaction'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Channel</label>
              <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNEL_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Direction</label>
              <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v as any }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">→ Outbound (we sent)</SelectItem>
                  <SelectItem value="inbound">← Inbound (they sent)</SelectItem>
                  <SelectItem value="internal">Internal note</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input
              className="h-8 text-sm mt-1"
              placeholder="e.g. QBR follow-up call"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Contacts {form.contactIds.length > 0 && (
                <span className="ml-1 text-foreground">
                  ({form.contactIds.length === 1 ? '1:1' : `Group · ${form.contactIds.length}`})
                </span>
              )}
            </label>
            <Popover open={contactPopoverOpen} onOpenChange={setContactPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start mt-1 h-8 text-xs font-normal">
                  {form.contactIds.length === 0
                    ? <span className="text-muted-foreground">No specific contact (account-wide)</span>
                    : (
                      <span className="truncate">
                        {form.contactIds.map(id => contactById[id]?.name).filter(Boolean).join(', ')}
                      </span>
                    )
                  }
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <div className="max-h-64 overflow-y-auto">
                  {contacts.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground text-center">No contacts on this account</div>
                  ) : contacts.map(c => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer text-xs"
                    >
                      <Checkbox
                        checked={form.contactIds.includes(c.id)}
                        onCheckedChange={() => toggleContact(c.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        {c.role && <div className="text-muted-foreground truncate text-[10px]">{c.role}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {form.contactIds.length > 1 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Group label <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <Input
                className="h-8 text-sm mt-1"
                placeholder="e.g. WhatsApp Acme Ops"
                value={form.groupLabel}
                onChange={e => setForm(f => ({ ...f, groupLabel: e.target.value }))}
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Summary</label>
            <Textarea
              className="text-sm mt-1 min-h-[60px]"
              value={form.summary}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              placeholder="What was discussed?"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Sentiment <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <div className="flex items-center gap-1 mt-1">
              {SENTIMENTS.map(s => {
                const selected = form.sentiment === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    title={s.label}
                    aria-label={s.label}
                    aria-pressed={selected}
                    onClick={() => setForm(f => ({ ...f, sentiment: selected ? null : s.value }))}
                    className={cn(
                      "h-8 w-8 flex items-center justify-center rounded-sm text-base transition-colors",
                      selected
                        ? "border border-border bg-accent"
                        : "border border-transparent hover:bg-muted"
                    )}
                  >
                    <span>{s.emoji}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="schedule-future"
              checked={form.isScheduled}
              onCheckedChange={(v) => setForm(f => ({ ...f, isScheduled: !!v }))}
            />
            <label htmlFor="schedule-future" className="text-xs cursor-pointer">
              Schedule for the future (planned interaction)
            </label>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {form.isScheduled ? 'Scheduled date' : 'Date'}
            </label>
            <Input
              type="date"
              className="h-8 text-sm mt-1"
              value={form.scheduledDate}
              onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!form.title.trim()}>
            {editingEvent ? 'Save' : (form.isScheduled ? 'Schedule' : 'Log')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
