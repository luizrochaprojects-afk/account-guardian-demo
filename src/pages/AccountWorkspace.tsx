import { useParams, Link, useSearchParams } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useAccounts } from '@/contexts/AccountsContext';
import { useContactsDB } from '@/hooks/useContactsDB';
import { useMemo, useState, useEffect } from 'react';
import { useProfile } from '@/hooks/useProfile';

import { AccountHeader } from '@/components/account/AccountHeader';
import { AccountOverview } from '@/components/account/AccountOverview';
import { CompanyInfoPanel, type FocusField } from '@/components/account/CompanyInfoPanel';
import { AccountHealthTab } from '@/components/account/AccountHealthTab';
import { SalesMotionTab } from '@/components/account/SalesMotionTab';
import { AccountIssuesTab } from '@/components/account/AccountIssuesTab';
import { LogInteractionDialog } from '@/components/account/LogInteractionDialog';
import { ContactDialog } from '@/components/account/ContactDialog';

// Notes, contacts and the interaction timeline all live on Overview, so deep
// links to a tab that no longer exists land on Overview instead.
const TAB_ALIASES: Record<string, string> = {
  contacts: 'overview', activity: 'overview', relationships: 'overview',
  delivery: 'issues', work: 'issues',
};
// 'health' is valid for every account so a stale link still works, but the
// trigger only shows post-close: it is structurally empty before.
const VALID_TABS = ['overview', 'sales', 'issues', 'health'];

export default function AccountWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { getAccount, updateAccount, loading: accountsLoading } = useAccounts();
  const account = getAccount(id || '');
  const { profile } = useProfile();
  const orgId = profile?.organization_id;

  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') ?? 'overview';
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : (TAB_ALIASES[rawTab] ?? 'overview');
  const setActiveTab = (t: string) => {
    const next = new URLSearchParams(searchParams);
    if (t === 'overview') next.delete('tab'); else next.set('tab', t);
    setSearchParams(next, { replace: true });
  };

  // Shared dialogs, opened either from the header buttons or from a one-shot
  // `?action=` deep link (e.g. links from notifications/emails).
  const [logInteractionOpen, setLogInteractionOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);

  // Setup checklist's owner/close-date/MRR actions must open the right editor
  // directly. All three live in the sidebar, which is mounted on every tab, so
  // this just carries a one-shot intent that CompanyInfoPanel consumes and then
  // clears (via onFocusHandled) — no tab switch required. Owner and close date
  // are Commercial rows; `mrr` is a property row (ARR derives from it).
  const [sidebarFocusField, setSidebarFocusField] = useState<FocusField | null>(null);
  const openSalesSetup = (field: FocusField) => {
    setSidebarFocusField(field);
  };
  useEffect(() => {
    const action = searchParams.get('action');
    if (!action) return;
    if (action === 'log-interaction') setLogInteractionOpen(true);
    if (action === 'add-contact') setAddContactOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // DB hooks for real data — these power the always-visible header & sidebar.
  const { contacts: accountContacts } = useContactsDB(id);

  const computedScore = useMemo(() => {
    if (!account) return 0;
    // Use health_score from DB account
    return account.healthScore;
  }, [account]);

  // Health doesn't apply yet in the sdr/sales phases — see the tab nav
  // gating below.
  const isPreSale = account?.pipeline_phase === 'sdr' || account?.pipeline_phase === 'sales';

  if (!account && (accountsLoading || !orgId)) {
    return (
      <AppLayout>
        <div role="status" aria-live="polite" className="flex flex-col h-full">
          <span className="sr-only">Loading account</span>
          <div className="flex items-center gap-3 border-b px-6 py-4">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-6 w-56" />
          </div>
          <div className="flex gap-4 border-b px-6 py-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-5 w-20" />
            ))}
          </div>
          <div className="max-w-[900px] space-y-4 p-6">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!account) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <FileQuestion className="h-10 w-10 text-muted-foreground" />
          <div className="text-center">
            <h2 className="text-base font-semibold">Account not found</h2>
            <p className="text-sm text-muted-foreground mt-1">It may have been deleted, or the link is wrong.</p>
          </div>
          <Button size="sm" asChild>
            <Link to="/accounts">Back to accounts</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader
          breadcrumbs={[
            { label: 'Accounts', href: '/accounts' },
            { label: account.name },
          ]}
        />
        <AccountHeader
          account={account}
          healthScore={computedScore}
          onUpdate={(patch) => updateAccount(account.id, patch)}
          onLogInteraction={() => setLogInteractionOpen(true)}
          onAddContact={() => setAddContactOpen(true)}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="px-4 h-8 justify-start rounded-none border-b bg-transparent gap-0">
            {[
              { value: 'overview', label: 'Overview' },
              { value: 'sales', label: 'Sales' },
              { value: 'issues', label: 'Issues' },
              // Health is structurally empty pre-close — every check reads
              // "not scored at this stage" — so it does not compete for
              // attention until there is something to show.
              ...(!isPreSale ? [{ value: 'health', label: 'Health' }] : []),
            ].map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-1 text-xs">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* One scroll container for the whole tab body, not two independent
              ones — colapsing the sidebar's own scrollbar into the page's so
              there's only ever one "which one is scrolling?". */}
          <div className="flex-1 flex overflow-y-auto bg-muted/30">
            <div className="flex-1 min-w-0">
              <TabsContent value="overview" className="p-6 mt-0 space-y-6 max-w-[900px]">
                <AccountOverview
                  account={account}
                  healthScore={computedScore}
                  contacts={accountContacts}
                  openTab={setActiveTab}
                  openLogInteraction={() => setLogInteractionOpen(true)}
                  openAddContact={() => setAddContactOpen(true)}
                  openSalesSetup={openSalesSetup}
                />
              </TabsContent>

              <TabsContent value="sales" className="p-6 mt-0 space-y-6 max-w-[900px]">
                {activeTab === 'sales' && <SalesMotionTab account={account} />}
              </TabsContent>

              <TabsContent value="issues" className="p-6 mt-0 space-y-6 max-w-[900px]">
                {activeTab === 'issues' && <AccountIssuesTab accountId={account.id} />}
              </TabsContent>

              <TabsContent value="health" className="p-6 mt-0 space-y-6 max-w-[900px]">
                {activeTab === 'health' && (
                  <AccountHealthTab
                    accountId={account.id}
                    trend={account.trend as any}
                    stage={account.lifecycleStage}
                  />
                )}
              </TabsContent>

            </div>

            <div className="w-[320px] border-l shrink-0 p-4 hidden lg:block bg-background sticky top-0 self-start max-h-full overflow-y-auto">
              <CompanyInfoPanel
                account={account}
                focusField={sidebarFocusField}
                onFocusHandled={() => setSidebarFocusField(null)}
              />
            </div>
          </div>
        </Tabs>

        <LogInteractionDialog accountId={account.id} open={logInteractionOpen} onOpenChange={setLogInteractionOpen} />
        <ContactDialog accountId={account.id} open={addContactOpen} onOpenChange={setAddContactOpen} />
      </div>
    </AppLayout>
  );
}
