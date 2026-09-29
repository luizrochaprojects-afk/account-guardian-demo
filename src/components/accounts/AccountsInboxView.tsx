import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Inbox, Settings as SettingsIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { useAgentSuggestions } from '@/hooks/useAgentSuggestions';
import { useAgentSettings } from '@/hooks/useAgentSettings';
import { useAccounts } from '@/contexts/AccountsContext';
import { SuggestionCard } from '@/components/agent/SuggestionCard';
import { MeetingGroupHeader } from '@/components/agent/MeetingGroupHeader';
import { AgentAuditPane } from '@/components/agent/AgentAuditPane';
import { groupByMeeting } from '@/lib/agentInboxGroup';
import type { SuggestionStatus } from '@/types/agent';

// AccountsInboxView — the sandbox where humans review what the meeting agent
// proposed. Three tabs: Inbox (pending), Stale (pending > 14 days),
// History (last 30 days, approved/rejected), Audit (everything the agent
// or humans did).
//
// Filters supported on Inbox/Stale: account dropdown, deep-linked via
// `?account=<id>`. Status filter is implicit per tab.
//
// Rendered inside `/accounts?view=inbox` — the parent page provides
// `<AppLayout>`, so this component is just the inner pane.

const STALE_THRESHOLD_DAYS = 14;

export default function AccountsInboxView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const accountFilter = searchParams.get('account') ?? '';
  const [tab, setTab] = useState<'inbox' | 'stale' | 'history' | 'audit'>('inbox');

  const settings = useAgentSettings();
  const { accounts } = useAccounts();

  const setAccountFilter = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set('account', val);
    else next.delete('account');
    setSearchParams(next, { replace: true });
  };

  return (
    <div data-tour="inbox" className="flex-1 overflow-auto px-6 pt-4 pb-6">
      {settings.data && !settings.data.enabled && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm flex items-center gap-2">
          <SettingsIcon className="h-4 w-4 text-amber-700" />
          <span className="flex-1 text-amber-900">The meeting agent is currently disabled. New suggestions arrive once it is enabled again.</span>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="stale">Stale</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox">
          <SuggestionsPane status="pending" accountId={accountFilter || null} />
        </TabsContent>
        <TabsContent value="stale">
          <SuggestionsPane status="pending" accountId={accountFilter || null} olderThanDays={STALE_THRESHOLD_DAYS} />
        </TabsContent>
        <TabsContent value="history">
          <SuggestionsPane status="all" accountId={accountFilter || null} historyMode />
        </TabsContent>
        <TabsContent value="audit">
          <AgentAuditPane accountId={accountFilter || null} className="mt-4" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface PaneProps {
  status: SuggestionStatus | 'all';
  accountId: string | null;
  olderThanDays?: number;
  historyMode?: boolean;
}

function SuggestionsPane({ status, accountId, olderThanDays, historyMode }: PaneProps) {
  const { suggestions, isLoading, approve, reject, batchApprove, isApproving, isRejecting } = useAgentSuggestions({
    status: historyMode ? 'all' : status,
    accountId: accountId || null,
    olderThanDays,
  });

  // History tab: filter out pending in-app since `status='all'` returns them too.
  const filtered = useMemo(() => {
    if (!historyMode) return suggestions;
    return suggestions.filter((s) => s.status !== 'pending');
  }, [historyMode, suggestions]);

  const groups = useMemo(() => groupByMeeting(filtered), [filtered]);
  const [openMeetings, setOpenMeetings] = useState<Record<string, boolean>>({});
  const toggleMeeting = (id: string) => setOpenMeetings((s) => ({ ...s, [id]: !(s[id] ?? true) }));

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-6 text-center">Loading suggestions…</div>;
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={historyMode ? 'No history yet' : 'Inbox zero'}
        description={historyMode
          ? 'Once you approve or reject suggestions they will show up here.'
          : olderThanDays
          ? `No suggestions older than ${olderThanDays} days. The agent is keeping up.`
          : 'The agent has no pending proposals right now. New ones arrive after the next meeting is processed.'}
      />
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {groups.map((g) => {
        const open = openMeetings[g.meetingId] ?? true;
        return (
          <div key={g.meetingId} className="space-y-2">
            <MeetingGroupHeader
              meetingId={g.meetingId}
              title={g.title}
              folderName={g.folderName}
              meetingDate={g.meetingDate}
              suggestions={g.suggestions}
              open={open}
              onToggle={() => toggleMeeting(g.meetingId)}
              onApproveAll={historyMode ? undefined : () => batchApprove({ ids: g.suggestions.map((s) => s.id) })}
            />
            {open && (
              <div className="pl-4 space-y-2">
                {g.suggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    onApprove={(edits) => approve({ suggestion_id: s.id, edits })}
                    onReject={(reason) => reject({ suggestion_id: s.id, reject_reason: reason ?? null })}
                    isBusy={isApproving || isRejecting}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
