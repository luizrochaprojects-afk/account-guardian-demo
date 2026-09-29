import { useState, useMemo } from 'react';
import { useEventsDB, type EventWithContacts } from '@/hooks/useEventsDB';
import { useContactsDB } from '@/hooks/useContactsDB';
import {
  Phone, Mail, Zap, AlertTriangle, FileText, Bot, Plus, Calendar,
  MessageCircle, MessagesSquare, Users, ArrowDownLeft, ArrowUpRight, ArrowRight,
  Building2, Check, Pencil, Trash2, Clock, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { format, isFuture, parseISO, startOfDay } from 'date-fns';
import { LIFECYCLE_GROUP_LABEL, extractStage, filterLifecycle, sortLifecycle } from '@/lib/lifecycle';
import { formatDate } from '@/lib/formatDate';
import { EditLifecycleEventDialog } from './EditLifecycleEventDialog';
import { LogInteractionDialog, SENTIMENTS } from './LogInteractionDialog';
import { useLifecycleHistory } from '@/hooks/useLifecycleHistory';
import { useSystemPropertyOptions } from '@/hooks/useSystemPropertyOptions';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AccountTimelineProps {
  accountId: string;
  limit?: number;
  hideLifecycle?: boolean;
}

const channelIcons: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle className="h-3 w-3" />,
  slack: <MessagesSquare className="h-3 w-3" />,
  email: <Mail className="h-3 w-3" />,
  call: <Phone className="h-3 w-3" />,
  meeting: <Calendar className="h-3 w-3" />,
  in_person: <Users className="h-3 w-3" />,
  sms: <MessageCircle className="h-3 w-3" />,
  other: <Zap className="h-3 w-3" />,
};

const typeIcons: Record<string, React.ReactNode> = {
  call: <Phone className="h-3 w-3" />,
  email: <Mail className="h-3 w-3" />,
  meeting: <Calendar className="h-3 w-3" />,
  action: <Zap className="h-3 w-3" />,
  alert: <AlertTriangle className="h-3 w-3" />,
  note: <FileText className="h-3 w-3" />,
  system: <Bot className="h-3 w-3" />,
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'past', label: 'Past' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'group', label: 'Group' },
  { value: '1to1', label: '1:1' },
];

const sentimentByValue = (v: string | null | undefined) =>
  v ? SENTIMENTS.find(s => s.value === v) : undefined;

// A trend computed from 1-2 logged sentiments is noise, not a trend, and must
// not render with the same visual confidence (a colored badge + icon) as a
// trend backed by a dozen data points. The
// raw per-emoji counts and the "N total" count stay visible regardless, so
// the user can still see when it's too early to trust a trend.
const MIN_SENTIMENT_SAMPLE_FOR_TREND = 3;

export function AccountTimeline({ accountId, limit, hideLifecycle }: AccountTimelineProps) {
  const { events, deleteEvent, completeEvent } = useEventsDB(accountId);
  const { contacts } = useContactsDB(accountId);
  const [filter, setFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventWithContacts | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [lifecycleEditId, setLifecycleEditId] = useState<string | null>(null);
  const { history: lifecycleHistory } = useLifecycleHistory(accountId);
  const { options: lifecycleStageOptions } = useSystemPropertyOptions(
    'account', 'pipeline_stage', ['Onboarding', 'Adoption', 'Expansion', 'Mature']
  );

  const contactById = useMemo(
    () => Object.fromEntries(contacts.map(c => [c.id, c])),
    [contacts]
  );

  // An interaction counts as "scheduled" if it has a future scheduled_at OR
  // a date that is today or in the future, and isn't already completed.
  const isScheduledEvent = (e: EventWithContacts) => {
    if (e.completed_at) return false;
    if (e.scheduled_at && isFuture(parseISO(e.scheduled_at))) return true;
    if (!e.scheduled_at && e.date) {
      const day = new Date(e.date + 'T00:00:00');
      return day.getTime() >= startOfDay(new Date()).getTime();
    }
    return false;
  };

  const visibleFilters = useMemo(
    () => hideLifecycle ? FILTERS.filter(f => f.value !== 'lifecycle') : FILTERS,
    [hideLifecycle]
  );

  // If lifecycle events are hidden but a stale 'lifecycle' filter is still
  // selected on this instance, fall back to 'all' rather than filtering out
  // everything.
  const effectiveFilter = hideLifecycle && filter === 'lifecycle' ? 'all' : filter;

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (hideLifecycle && e.group_label === LIFECYCLE_GROUP_LABEL) return false;
      if (effectiveFilter === 'scheduled') return isScheduledEvent(e);
      if (effectiveFilter === 'past') return !isScheduledEvent(e);
      if (effectiveFilter === 'lifecycle') return e.group_label === LIFECYCLE_GROUP_LABEL;
      if (effectiveFilter === 'group') return (e.contact_ids?.length || 0) > 1;
      if (effectiveFilter === '1to1') return (e.contact_ids?.length || 0) === 1;
      return true;
    });
  }, [events, effectiveFilter, hideLifecycle]);

  const displayed = limit ? filtered.slice(0, limit) : filtered;
  const isEmpty = displayed.length === 0;

  // The stage a lifecycle event transitioned FROM — the previous transition
  // chronologically, account-wide (not just within `displayed`). Without this,
  // a stage-change event only shows the destination ("Business Case"), and two
  // same-day transitions with no explicit direction read as if the account
  // moved backward.
  const fromStageById = useMemo(() => {
    const ordered = sortLifecycle(filterLifecycle(events));
    const map: Record<string, string | null> = {};
    ordered.forEach((e, i) => {
      map[e.id] = i > 0 ? extractStage(ordered[i - 1].title) : null;
    });
    return map;
  }, [events]);

  // Human events (calls, emails, notes) render as full cards; system events
  // (stage changes) collapse into a single thin gray line per day so they
  // don't compete visually with real activity. Grouping only
  // merges lifecycle events that are ALSO adjacent in the already-sorted
  // `displayed` list, so a human event in between still splits the group.
  type TimelineRow =
    | { kind: 'human'; event: EventWithContacts }
    | { kind: 'system'; dateKey: string; items: EventWithContacts[] };

  const rows = useMemo(() => {
    const out: TimelineRow[] = [];
    for (const e of displayed) {
      if (e.group_label !== LIFECYCLE_GROUP_LABEL) {
        out.push({ kind: 'human', event: e });
        continue;
      }
      const dateKey = e.date ?? e.created_at.slice(0, 10);
      const last = out[out.length - 1];
      if (last && last.kind === 'system' && last.dateKey === dateKey) {
        last.items.push(e);
      } else {
        out.push({ kind: 'system', dateKey, items: [e] });
      }
    }
    return out;
  }, [displayed]);

  // Compact sentiment summary: counts + simple trend (recent half vs older half)
  const sentimentSummary = useMemo(() => {
    const withSentiment = events.filter(e => !!e.sentiment);
    const counts: Record<string, number> = {};
    SENTIMENTS.forEach(s => { counts[s.value] = 0; });
    withSentiment.forEach(e => {
      if (e.sentiment && counts[e.sentiment as string] !== undefined) {
        counts[e.sentiment as string] += 1;
      }
    });
    const total = withSentiment.length;

    // Score per sentiment: very_positive=+2, positive=+1, neutral=0, negative=-1, very_negative=-2
    const scoreMap: Record<string, number> = {
      very_positive: 2, positive: 1, neutral: 0, negative: -1, very_negative: -2,
    };
    const score = (e: EventWithContacts) =>
      e.sentiment ? (scoreMap[e.sentiment as string] ?? 0) : 0;

    // Sort chronologically (oldest -> newest) for trend computation
    const chrono = [...withSentiment].sort((a, b) => {
      const da = a.scheduled_at || a.date || a.created_at || '';
      const db = b.scheduled_at || b.date || b.created_at || '';
      return da.localeCompare(db);
    });

    let trend: 'up' | 'down' | 'flat' | null = null;
    let avg: number | null = null;
    if (chrono.length >= 2) {
      const mid = Math.floor(chrono.length / 2);
      const older = chrono.slice(0, mid);
      const recent = chrono.slice(mid);
      const olderAvg = older.reduce((s, e) => s + score(e), 0) / older.length;
      const recentAvg = recent.reduce((s, e) => s + score(e), 0) / recent.length;
      avg = recentAvg;
      const delta = recentAvg - olderAvg;
      trend = delta > 0.25 ? 'up' : delta < -0.25 ? 'down' : 'flat';
    } else if (chrono.length === 1) {
      avg = score(chrono[0]);
      trend = 'flat';
    }

    return { counts, total, trend, avg };
  }, [events]);

  function openCreate() {
    setEditingEvent(null);
    setDialogOpen(true);
  }

  function openEdit(e: EventWithContacts) {
    setEditingEvent(e);
    setDialogOpen(true);
  }

  function getInteractionMeta(e: EventWithContacts) {
    const channel = e.channel || e.type;
    const isScheduled = isScheduledEvent(e);
    const count = e.contact_ids?.length || 0;
    const isGroup = count > 1;
    const isBroadcast = count === 0;
    return { channel, isScheduled, count, isGroup, isBroadcast };
  }

  function renderContactChips(e: EventWithContacts) {
    const { count, isGroup, isBroadcast } = getInteractionMeta(e);
    if (isBroadcast) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Building2 className="h-2.5 w-2.5" /> Account
        </span>
      );
    }
    if (isGroup) {
      const names = e.contact_ids.slice(0, 2).map(id => contactById[id]?.name?.split(' ')[0]).filter(Boolean);
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Users className="h-2.5 w-2.5" />
          {e.group_label || `${names.join(', ')}${count > 2 ? ` +${count - 2}` : ''}`}
          <span className="px-1 py-0 rounded-sm bg-muted font-mono">{count}</span>
        </span>
      );
    }
    const c = contactById[e.contact_ids[0]];
    return c ? (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <span className="h-3 w-3 rounded-full bg-muted flex items-center justify-center text-[8px] font-medium">
          {c.name.charAt(0)}
        </span>
        {c.name}
      </span>
    ) : null;
  }

  return (
    <div>
      {sentimentSummary.total > 0 && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 border rounded-sm bg-muted/30">
          <span className="text-[10px] font-medium text-muted-foreground">
            Sentiment
          </span>
          <div className="flex items-center gap-1.5">
            {SENTIMENTS.map(s => {
              const c = sentimentSummary.counts[s.value] || 0;
              if (c === 0) return null;
              return (
                <span
                  key={s.value}
                  title={`${s.label}: ${c}`}
                  className="inline-flex items-center gap-0.5 text-[11px]"
                >
                  <span>{s.emoji}</span>
                  <span className="font-mono text-muted-foreground">{c}</span>
                </span>
              );
            })}
          </div>
          <div className="flex-1" />
          {sentimentSummary.trend && sentimentSummary.total >= MIN_SENTIMENT_SAMPLE_FOR_TREND && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm border",
                sentimentSummary.trend === 'up' && "text-foreground border-border bg-accent",
                sentimentSummary.trend === 'down' && "text-destructive border-destructive/30 bg-destructive/5",
                sentimentSummary.trend === 'flat' && "text-muted-foreground border-border"
              )}
              title={`Recent trend (${sentimentSummary.total} logged)`}
            >
              {sentimentSummary.trend === 'up' && <TrendingUp className="h-2.5 w-2.5" />}
              {sentimentSummary.trend === 'down' && <TrendingDown className="h-2.5 w-2.5" />}
              {sentimentSummary.trend === 'flat' && <Minus className="h-2.5 w-2.5" />}
              {sentimentSummary.trend === 'up' ? 'Improving' :
                sentimentSummary.trend === 'down' ? 'Declining' : 'Steady'}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground font-mono">
            {sentimentSummary.total} total
          </span>
        </div>
      )}

      {!limit && (
        <div className="flex items-center gap-2 mb-2">
          {/* A dropdown, not a row of tabs — these are cuts of the same
              timeline, not separate destinations. */}
          <Select value={effectiveFilter} onValueChange={setFilter}>
            <SelectTrigger className="h-7 w-auto text-xs gap-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visibleFilters.map(f => (
                <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          {!isEmpty && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openCreate}>
              <Plus className="h-3 w-3 mr-1" /> Log interaction
            </Button>
          )}
        </div>
      )}

      {limit && !isEmpty && (
        <div className="flex items-center justify-end mb-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openCreate}>
            <Plus className="h-3 w-3 mr-1" /> Log interaction
          </Button>
        </div>
      )}

      <div className="border rounded-sm">
        {isEmpty && (
          <EmptyState
            compact
            title="No interactions yet"
            description="Log calls, meetings and messages to build the account history."
            action={<Button size="sm" onClick={openCreate}>Log interaction</Button>}
          />
        )}
        <div className="divide-y">
          {rows.map(row => {
            if (row.kind === 'system') {
              return (
                <div key={`system-${row.dateKey}`} className="flex flex-col gap-0.5 px-3 py-1.5 bg-muted/20 text-[11px] text-muted-foreground">
                  {row.items.map(event => {
                    const from = fromStageById[event.id];
                    const to = extractStage(event.title);
                    return (
                      <div key={event.id} className="flex items-center gap-1.5 group">
                        <span className="flex items-center gap-1 font-mono">
                          {from && <>{from} <ArrowRight className="h-2.5 w-2.5" /></>}
                          {to}
                        </span>
                        <span>· {formatDate(event.created_at)}</span>
                        <button
                          className="p-0.5 hover:bg-muted rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setLifecycleEditId(event.id)}
                          title="Edit stage transition date"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            }

            const event = row.event;
            const { channel, isScheduled } = getInteractionMeta(event);
            const icon = channelIcons[channel || ''] || typeIcons[event.type] || <Zap className="h-3 w-3" />;
            const dirIcon = event.direction === 'inbound'
              ? <ArrowDownLeft className="h-2.5 w-2.5 text-foreground" />
              : event.direction === 'internal'
                ? <Bot className="h-2.5 w-2.5 text-muted-foreground" />
                : <ArrowUpRight className="h-2.5 w-2.5 text-foreground" />;

            const dt = event.scheduled_at
              ? parseISO(event.scheduled_at)
              : (event.date ? new Date(event.date + 'T00:00:00') : null);

            return (
              <div key={event.id} className={cn(
                "flex items-start gap-2.5 px-3 py-2 hover:bg-muted/50 group",
                isScheduled && "bg-accent/30"
              )}>
                <span className="mt-0.5 text-muted-foreground shrink-0 relative">
                  {icon}
                  <span className="absolute -bottom-0.5 -right-1">{dirIcon}</span>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs">{event.title}</span>
                    {isScheduled && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0 rounded-sm bg-accent text-foreground border border-border">
                        <Clock className="h-2 w-2" /> Scheduled
                      </span>
                    )}
                  </div>
                  {event.summary && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{event.summary}</div>
                  )}
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {event.sentiment && (() => {
                      const s = sentimentByValue(event.sentiment);
                      return s ? (
                        <span
                          title={s.label}
                          aria-label={s.label}
                          className="text-[11px] leading-none"
                        >
                          {s.emoji}
                        </span>
                      ) : null;
                    })()}
                    {renderContactChips(event)}
                    <span className="text-[10px] text-muted-foreground">
                      {dt ? format(dt, 'MMM d') : ''}
                      {event.time ? ` · ${event.time}` : ''}
                      {event.scheduled_at && !event.time ? ` · ${format(parseISO(event.scheduled_at), 'HH:mm')}` : ''}
                    </span>
                  </div>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {isScheduled && (
                    <button
                      className="p-0.5 hover:bg-muted rounded-sm"
                      onClick={() => completeEvent(event.id)}
                      title="Mark as completed"
                    >
                      <Check className="h-3 w-3 text-foreground" />
                    </button>
                  )}
                  <button className="p-0.5 hover:bg-muted rounded-sm" onClick={() => openEdit(event)}>
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <button className="p-0.5 hover:bg-muted rounded-sm" onClick={() => setDeleteId(event.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LogInteractionDialog
        accountId={accountId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingEvent={editingEvent}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this interaction?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { if (deleteId) { await deleteEvent(deleteId); setDeleteId(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {lifecycleEditId && (
        <EditLifecycleEventDialog
          open={!!lifecycleEditId}
          onOpenChange={(o) => { if (!o) setLifecycleEditId(null); }}
          accountId={accountId}
          history={lifecycleHistory}
          stageOptions={lifecycleStageOptions}
          mode={{ kind: 'edit', eventId: lifecycleEditId }}
        />
      )}
    </div>
  );
}
