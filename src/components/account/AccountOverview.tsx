import { useState } from 'react';
import { format } from 'date-fns';
import { useTasksDB } from '@/hooks/useProjectsDB';
import { useEventsDB } from '@/hooks/useEventsDB';
import { useHealthLogs } from '@/hooks/useHealthLogs';
import { useAccountHealthProfile } from '@/contexts/HealthConfigContext';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { getHealthState, HEALTH_STATE_LABEL } from '@/lib/healthScoring';
import { HealthBadge } from '@/components/HealthBadge';
import { AccountSetupChecklist, buildSetupItems } from './AccountSetupChecklist';
import { AccountNowBlock } from './AccountNowBlock';
import type { FocusField } from './CompanyInfoPanel';
import { AccountNotesInline } from './AccountNotesInline';
import { AccountContacts } from './AccountContacts';
import { AccountTimeline } from './AccountTimeline';
import { formatDate } from '@/lib/formatDate';
import { isTerminalStatus } from '@/lib/issueSort';
import type { Account } from '@/contexts/AccountsContext';
import type { DbContact } from '@/hooks/useContactsDB';

interface AccountOverviewProps {
  account: Account;
  healthScore: number;
  contacts: DbContact[];
  openTab: (tab: string) => void;
  openLogInteraction: () => void;
  openAddContact: () => void;
  /** Focuses a field's editor in the sidebar — mounted on every tab, so no tab
   * switch is needed. `mrr` is a property row, the other two are Commercial. */
  openSalesSetup: (field?: FocusField) => void;
}

export function AccountOverview({ account, healthScore, contacts, openTab, openLogInteraction, openAddContact, openSalesSetup }: AccountOverviewProps) {
  const [activityExpanded, setActivityExpanded] = useState(false);
  const { profile } = useProfile();
  const orgId = profile?.organization_id;
  // Every open issue on the account, milestone-bound ones included. This used
  // to pass `standaloneOnly: true`, which silently dropped anything living
  // inside a project: one account showed "1 open issue" against 15, another
  // "No open issues" against 30 — while the Delivery tab one click away listed
  // them all.
  const { tasks, loading: tasksLoading, addTask, updateTask } = useTasksDB(undefined, orgId || undefined, { accountId: account.id });
  const { events } = useEventsDB(account.id);
  const { logs, loading: logsLoading } = useHealthLogs(account.id);
  const { members: orgMembers } = useOrgMembers();
  // Same metric set the Health tab uses for this account — resolved from its
  // stage, not from whichever profile is selected in the config screen.
  const healthProfile = useAccountHealthProfile(account.lifecycleStage);

  const setupItems = buildSetupItems({
    account, contactCount: contacts.length, eventCount: events.length,
    openLogInteraction, openAddContact, openSalesSetup,
  });
  const healthState = getHealthState(
    healthProfile?.metrics.length ?? 0,
    logs.length,
    logs.at(-1)?.total_score ?? healthScore,
    { stageMapped: healthProfile !== null },
  );
  const openIssues = tasks.filter(t => !t.parent_id && !isTerminalStatus(t.status));
  const nextDue = openIssues.filter(t => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!)).slice(0, 3);

  async function handleCreateIssue(name: string) {
    if (!orgId) return;
    await addTask({
      name,
      organization_id: orgId,
      account_id: account.id,
      milestone_id: null,
      status: 'todo',
      assigned_role: 'CSM',
    } as any);
  }

  return (
    <div className="space-y-6">
      <AccountNowBlock
        account={account}
        openIssues={openIssues}
        orgMembers={orgMembers}
        onUpdateTask={updateTask}
        onCreateIssue={handleCreateIssue}
        onOpenTab={openTab}
        onFocusSidebarField={openSalesSetup}
      />

      {/* Interactions + lifecycle history — expands in place instead of
          routing to a separate tab. */}
      <SectionCard
        title="Recent activity"
        action={
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setActivityExpanded((v) => !v)}>
            {activityExpanded ? 'Show less' : 'View all'}
          </Button>
        }
      >
        <AccountTimeline accountId={account.id} limit={activityExpanded ? undefined : 5} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Open work" action={<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openTab('delivery')}>View all</Button>}>
          {/* "No open issues" is a claim about the account, not about the
              network. Until the query answers, show the shape instead. */}
          {tasksLoading ? (
            <div role="status" aria-live="polite" className="space-y-1.5">
              <span className="sr-only">Loading open work</span>
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
          ) : openIssues.length === 0 ? (
            <EmptyState compact title="No open issues" action={<Button size="sm" variant="outline" onClick={() => openTab('delivery')}>Create issue</Button>} />
          ) : (
            <div className="space-y-1.5 text-xs">
              <p className="text-muted-foreground">{openIssues.length} open issue{openIssues.length === 1 ? '' : 's'}</p>
              {nextDue.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{t.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground shrink-0" title={formatDate(t.due_date)}>{format(new Date(t.due_date!), 'MMM d')}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Health">
          {logsLoading ? (
            <div role="status" aria-live="polite" className="flex items-center gap-2">
              <span className="sr-only">Loading health</span>
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-3.5 w-36" />
            </div>
          ) : healthState === 'not_applicable' ? (
            <EmptyState compact title="Not scored at this stage" description="Health scoring applies once the account reaches onboarding." />
          ) : healthState === 'not_configured' ? (
            <EmptyState compact title="Health score not configured" description="Define the signals that determine account health." action={<Button size="sm" variant="outline" onClick={() => openTab('health')}>Configure health score</Button>} />
          ) : healthState === 'no_data' ? (
            <EmptyState compact title="No health data yet" action={<Button size="sm" variant="outline" onClick={() => openTab('health')}>Log health update</Button>} />
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <HealthBadge score={logs.at(-1)?.total_score ?? healthScore} size="sm" />
              <span>{HEALTH_STATE_LABEL[healthState]}</span>
              {logs.length > 0 && <span className="text-muted-foreground">· updated {formatDate(logs.at(-1)!.logged_at)}</span>}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Contacts">
        <AccountContacts contacts={contacts} accountId={account.id} />
      </SectionCard>

      <SectionCard title="Notes">
        <AccountNotesInline accountId={account.id} />
      </SectionCard>

      {/* Setup progress — a footer bar, not the first thing an AE sees.
          buildSetupItems already never
          suggests a step the current stage doesn't support. */}
      <AccountSetupChecklist items={setupItems} />
    </div>
  );
}
