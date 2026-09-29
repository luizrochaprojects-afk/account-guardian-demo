import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAccounts } from '@/contexts/AccountsContext';
import type { Account } from '@/contexts/AccountsContext';
import { healthLabel, healthBucket, accountColors } from '@/lib/badgeTokens';
import { useCustomProperties } from '@/hooks/useCustomProperties';
import { useCustomPropertyValuesBulk } from '@/hooks/useCustomPropertyValues';
import { PropertyField } from '@/components/properties/PropertyField';
import { isSystemAccountKey, SYSTEM_KEY_TO_ACCOUNT_FIELD } from '@/hooks/useAccountFieldValue';
import { visibleCreateProps } from '@/lib/createFormFields';
import { db } from '@/demo/db';
import { useProfile } from '@/hooks/useProfile';
import { useRole } from '@/hooks/useRole';
import { useQueryClient } from '@tanstack/react-query';
import { healthLogsQuery } from '@/hooks/useHealthLogs';
import { useHealthTrends } from '@/hooks/useHealthTrends';
import { useOrgSettings } from '@/hooks/useOrgSettings';
import { useCustomerSignals } from '@/hooks/useCustomerSignals';
import { CUSTOMER_COLUMNS } from '@/lib/customerColumns';
import { formatCurrencyValue } from '@/lib/currency';
import { SaveViewButton } from '@/components/views/SaveViewButton';
import { ViewPill } from '@/components/views/ViewPill';
import { ExportViewButton } from '@/components/views/ExportViewButton';
import { useCustomViews } from '@/hooks/useCustomViews';
import { useViewDisplayPersist } from '@/hooks/useViewDisplayPersist';
import { ViewDraftHeader } from '@/components/views/ViewDraftHeader';
import { DisplayOptionsPopover } from '@/components/views/DisplayOptionsPopover';
import { FilterPopover } from '@/components/views/FilterPopover';
import { FiltersAccountsSection } from '@/components/views/filters/FiltersAccountsSection';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useSearchParams } from 'react-router-dom';
import { FilterChipGroup } from '@/components/listing';
import { applyFiltersToSearchParams, matchesOwnerFilters } from '@/lib/viewFilters';
import { AccountsViewSwitcher, useAccountsViewMode } from '@/components/accounts/AccountsViewSwitcher';
import AccountsTableView from '@/components/accounts/AccountsTableView';
import AccountsPipelineView from '@/components/accounts/AccountsPipelineView';
import AccountsInboxView from '@/components/accounts/AccountsInboxView';
import { CostCapBanner } from '@/components/agent/CostCapBanner';

// A `view` param value is a saved-view reference only when it looks like a UUID.
// 'table' / 'pipeline' / 'inbox' are the AccountsViewSwitcher modes and must not
// be mistaken for saved views (which would suppress LS hydration and reset
// search/filter state to defaults on mount).
const SAVED_VIEW_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isSavedViewIdParam = (v: string | null): boolean => !!v && SAVED_VIEW_ID_RE.test(v);

type ColumnKey = 'segment' | 'health' | 'arr' | 'lastSeen' | 'lastInteraction' | 'revenueOwner' | 'deliveryOwner' | string;

const COLUMNS: { key: ColumnKey; label: string; defaultVisible: boolean }[] = [
  { key: 'segment', label: 'Segment', defaultVisible: true },
  { key: 'health', label: 'Health', defaultVisible: true },
  { key: 'arr', label: 'Potential ARR', defaultVisible: true },
  { key: 'lastSeen', label: 'Last Seen', defaultVisible: true },
  { key: 'lastInteraction', label: 'Last Interaction', defaultVisible: true },
  // The two owner columns. Off by default: a stored visible
  // set overrides these defaults anyway, so shipping them on would only change
  // the table for people who never opened the column chooser.
  { key: 'revenueOwner', label: 'Revenue owner', defaultVisible: false },
  { key: 'deliveryOwner', label: 'Delivery owner', defaultVisible: false },
  // Customer-phase columns. Hidden by default: they are dead weight on
  // an SDR or Sales account, and there are fourteen of them.
  ...CUSTOMER_COLUMNS.map((c) => ({
    key: c.key,
    label: c.label,
    defaultVisible: false,
  })),
];

interface AccountRow {
  id: string;
  name: string;
  segment: string;
  lifecycleStage: string;
  initials: string;
  color: string;
  healthScore: number;
  healthStatus: 'healthy' | 'concerning' | 'poor' | 'no_data';
  arr: number;
  lastSeen: string;
  lastInteraction: string;
  // Resolved display names, not uuids: the table renders them directly and the
  // group-by buckets by them.
  revenueOwnerId: string | null;
  deliveryOwnerId: string | null;
  revenueOwner: string;
  deliveryOwner: string;
  rawUpdatedAt: string | undefined;
  rawLastContact: string | undefined;
}

type SortKey = 'name' | 'arr' | 'healthScore' | 'lastSeen';
type SortDir = 'asc' | 'desc';

const SORT_OPTIONS: { value: SortKey; label: string; defaultDir: SortDir }[] = [
  { value: 'name', label: 'Name', defaultDir: 'asc' },
  { value: 'arr', label: 'Potential ARR', defaultDir: 'desc' },
  { value: 'healthScore', label: 'Health', defaultDir: 'asc' },
  { value: 'lastSeen', label: 'Last seen', defaultDir: 'desc' },
];

// segmentColors, accountColors imported from badgeTokens

function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildRows(accounts: Account[], nameFor: (id: string | null) => string): AccountRow[] {
  return accounts.map((a, i) => {
    const healthStatus: AccountRow['healthStatus'] = healthBucket(a.healthScore);

    return {
      id: a.id,
      name: a.name,
      segment: a.segment,
      lifecycleStage: a.lifecycleStage || '',
      initials: a.name.split(' ').map(w => w[0]).join('').slice(0, 2),
      color: accountColors[i % accountColors.length],
      healthScore: a.healthScore,
      healthStatus,
      arr: a.arr || a.mrr * 12,
      lastSeen: formatTimeAgo(a.updatedAt),
      lastInteraction: formatTimeAgo(a.lastContact),
      revenueOwnerId: a.revenue_owner_id,
      deliveryOwnerId: a.delivery_owner_id,
      revenueOwner: nameFor(a.revenue_owner_id),
      deliveryOwner: nameFor(a.delivery_owner_id),
      rawUpdatedAt: a.updatedAt,
      rawLastContact: a.lastContact,
    };
  });
}

// healthDotColor, healthLabel imported from badgeTokens

const defaultAccount = {
  name: '',
  healthScore: 0,
  trend: 'flat',
  segment: 'SMB',
  mrr: 0,
  channels: ['Email'],
  tags: [],
  industry: '',
  plan: 'Starter',
  arr: 0,
  customerSince: new Date().toISOString().split('T')[0],
  lifecycleStage: 'target',
  region: 'North America',
  codePrefix: '',
} as unknown as Omit<Account, 'id'>;

type GroupByKey = 'none' | 'healthStatus' | 'segment' | 'lifecycleStage' | 'plan' | 'region' | 'revenueOwner' | 'deliveryOwner';

const GROUP_BY_OPTIONS: { value: GroupByKey; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'healthStatus', label: 'Health' },
  { value: 'segment', label: 'Segment' },
  { value: 'lifecycleStage', label: 'Lifecycle' },
  { value: 'plan', label: 'Plan' },
  { value: 'region', label: 'Region' },
  { value: 'revenueOwner', label: 'Revenue owner' },
  { value: 'deliveryOwner', label: 'Delivery owner' },
];


function getGroupValue(row: AccountRow, account: Account | undefined, key: GroupByKey): string {
  if (key === 'healthStatus') return healthLabel[row.healthStatus];
  if (key === 'segment') return row.segment;
  // 'Unassigned', not 'Unknown': a null owner is a known state, and Unassigned
  // is the word the rest of the product uses for it.
  if (key === 'revenueOwner') return row.revenueOwner || 'Unassigned';
  if (key === 'deliveryOwner') return row.deliveryOwner || 'Unassigned';
  if (account) {
    if (key === 'lifecycleStage') return account.lifecycleStage || 'Unknown';
    if (key === 'plan') return account.plan || 'Unknown';
    if (key === 'region') return account.region || 'Unknown';
  }
  return 'Unknown';
}

// groupDotColors imported from badgeTokens

type FilterKey = 'health' | 'segment' | 'revenueOwner' | 'deliveryOwner';

export default function AllAccounts() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { isFounder } = useRole();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();
  const { currencySymbol, currencyCode } = useOrgSettings();
  const { members: orgMembers } = useOrgMembers();
  const formatCurrency = (n: number) => formatCurrencyValue(n, currencySymbol, currencyCode);
  const [accountsViewMode, setAccountsViewMode] = useAccountsViewMode();
  // The Inbox tab only needs the accounts list (for its filter dropdown) — the
  // org-wide signals/health-trend/custom-property queries below are unused
  // there and were making the tab feel slow to load.
  const isInboxMode = accountsViewMode === 'inbox';
  // Lookup function rather than widening AccountRow. The signals view only covers customer-phase accounts, so this is undefined
  // for most rows and the columns render '—', which is the honest answer.
  const { byAccount: signalsByAccount } = useCustomerSignals({ enabled: !isInboxMode });
  const getCustomerSignals = (id: string) => signalsByAccount.get(id);
  const { accounts, loading: accountsLoading, addAccount, updateAccount, deleteAccount } = useAccounts();
  const { properties: customProps } = useCustomProperties('account');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupByKey>('none');
  const [searchParams, setSearchParams] = useSearchParams();
  const { views: savedViews } = useCustomViews('accounts');
  const savedViewParam = isSavedViewIdParam(searchParams.get('view')) ? searchParams.get('view') : null;
  const activeSavedView = savedViewParam ? savedViews.find(v => v.id === savedViewParam) : null;
  const isOnSavedView = !!savedViewParam;
  const isDraftMode = searchParams.get('draft') === '1';
  const isEditMode = !!activeSavedView && searchParams.get('edit') === '1';
  const draftActive = isDraftMode || isEditMode;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    if (isSavedViewIdParam(sp.get('view'))) return '';
    return sp.get('q') || '';
  });
  const [activeFilters, setActiveFilters] = useState<Record<FilterKey, Set<string>>>(() => {
    const sp = new URLSearchParams(window.location.search);
    if (isSavedViewIdParam(sp.get('view'))) {
      return { health: new Set(), segment: new Set(), revenueOwner: new Set(), deliveryOwner: new Set() };
    }
    return {
      health: new Set((sp.get('health') || '').split(',').filter(Boolean)),
      segment: new Set((sp.get('segment') || '').split(',').filter(Boolean)),
      revenueOwner: new Set((sp.get('rown') || '').split(',').filter(Boolean)),
      deliveryOwner: new Set((sp.get('down') || '').split(',').filter(Boolean)),
    };
  });
  const [includeChurned, setIncludeChurned] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    if (isSavedViewIdParam(sp.get('view'))) return false;
    return sp.get('churned') === '1';
  });
  // "Accounts I'm on", either side. A flag rather than two pre-filled owner
  // lists, so a saved view named "My accounts" follows whoever opens it.
  const [onlyMine, setOnlyMine] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    if (isSavedViewIdParam(sp.get('view'))) return false;
    return sp.get('mine') === '1';
  });
  const [customPropsFilter, setCustomPropsFilter] = useState<Record<string, string[]>>(() => {
    const sp = new URLSearchParams(window.location.search);
    if (isSavedViewIdParam(sp.get('view'))) return {};
    const result: Record<string, string[]> = {};
    sp.forEach((value, key) => {
      if (key.startsWith('cp_')) {
        const vals = value.split(',').filter(Boolean);
        if (vals.length) result[key.slice(3)] = vals;
      }
    });
    return result;
  });

  const STORAGE_NS = `accounts:${orgId ?? 'anon'}`;
  const COLS_KEY = `${STORAGE_NS}:visibleColumns`;
  const SORT_KEY = `${STORAGE_NS}:sort`;
  const SORT_DIR_KEY = `${STORAGE_NS}:sortDir`;
  const GROUP_KEY = `${STORAGE_NS}:groupBy`;

  const [sortBy, setSortBy] = useState<SortKey>(() => {
    try { const v = localStorage.getItem(SORT_KEY); if (v) return v as SortKey; } catch {}
    return 'healthScore';
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    try { const v = localStorage.getItem(SORT_DIR_KEY); if (v === 'asc' || v === 'desc') return v; } catch {}
    return 'asc';
  });
  // Subtle "updating" pulse — flips on for ~250ms whenever filters, sort, or
  // grouping change so every table mutation gives operators an instant visual
  // ack while React re-derives `rows`. Cheaper than a real spinner; matches
  // Linear's feel. (Pagination would slot into the signature too, but this
  // table currently renders all rows.)
  const [isFilterUpdating, setIsFilterUpdating] = useState(false);
  const filterPulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterSig = [
    [...activeFilters.health].sort().join(','),
    [...activeFilters.segment].sort().join(','),
    [...activeFilters.revenueOwner].sort().join(','),
    [...activeFilters.deliveryOwner].sort().join(','),
    onlyMine ? '1' : '0',
    includeChurned ? '1' : '0',
    sortBy,
    sortDir,
    groupBy,
  ].join('|');
  const filterSigRef = useRef(filterSig);
  useEffect(() => {
    if (filterSigRef.current === filterSig) return;
    filterSigRef.current = filterSig;
    setIsFilterUpdating(true);
    if (filterPulseTimer.current) clearTimeout(filterPulseTimer.current);
    filterPulseTimer.current = setTimeout(() => setIsFilterUpdating(false), 250);
    return () => {
      if (filterPulseTimer.current) clearTimeout(filterPulseTimer.current);
    };
  }, [filterSig]);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set(COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
  });

  // Hydrate from localStorage once orgId becomes available
  // (initial render may have used 'anon' fallback before profile loaded).
  // We must hydrate BEFORE allowing save effects to run, otherwise the save
  // effects fire when COLS_KEY changes (orgId resolves) and overwrite stored
  // values with current defaults.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!orgId || hydrated) return;
    // On a saved view the LS namespace must stay untouched — saved view
    // hydration is the single source of truth, otherwise LS races and
    // overwrites the view's filters/sort/columns with stale defaults.
    if (isOnSavedView) { setHydrated(true); return; }
    try {
      const cols = localStorage.getItem(COLS_KEY);
      if (cols) setVisibleColumns(new Set(JSON.parse(cols)));
      const s = localStorage.getItem(SORT_KEY);
      if (s) setSortBy(s as SortKey);
      const sd = localStorage.getItem(SORT_DIR_KEY);
      if (sd === 'asc' || sd === 'desc') setSortDir(sd);
      const g = localStorage.getItem(GROUP_KEY);
      if (g) setGroupBy(g as GroupByKey);
    } catch {}
    setHydrated(true);
  }, [orgId, hydrated, COLS_KEY, SORT_KEY, SORT_DIR_KEY, GROUP_KEY, isOnSavedView]);

  useEffect(() => {
    if (!hydrated) return;
    if (isOnSavedView) return;
    try { localStorage.setItem(COLS_KEY, JSON.stringify([...visibleColumns])); } catch {}
  }, [hydrated, visibleColumns, COLS_KEY, isOnSavedView]);
  useEffect(() => {
    if (!hydrated) return;
    if (isOnSavedView) return;
    try { localStorage.setItem(SORT_KEY, sortBy); } catch {}
  }, [hydrated, sortBy, SORT_KEY, isOnSavedView]);
  useEffect(() => {
    if (!hydrated) return;
    if (isOnSavedView) return;
    try { localStorage.setItem(SORT_DIR_KEY, sortDir); } catch {}
  }, [hydrated, sortDir, SORT_DIR_KEY, isOnSavedView]);
  useEffect(() => {
    if (!hydrated) return;
    if (isOnSavedView) return;
    try { localStorage.setItem(GROUP_KEY, groupBy); } catch {}
  }, [hydrated, groupBy, GROUP_KEY, isOnSavedView]);

  // Sync filter state → URL search params so chip removal (and other in-page
  // filter mutations) immediately reflect in the address bar without a full
  // page rerender. Uses `replace: true` to avoid bloating browser history.
  useEffect(() => {
    if (!hydrated) return;
    const next = applyFiltersToSearchParams('accounts', searchParams, {
      search: searchQuery,
      health: [...activeFilters.health],
      segment: [...activeFilters.segment],
      revenueOwner: [...activeFilters.revenueOwner],
      deliveryOwner: [...activeFilters.deliveryOwner],
      myAccounts: onlyMine,
      includeChurned,
      sortBy,
      sortDir,
      groupBy,
      visibleColumns: [...visibleColumns],
      customProps: customPropsFilter,
    });
    // `applyFiltersToSearchParams` strips `view` unless it's a UUID (saved view).
    // The AccountsViewSwitcher writes `view=pipeline|inbox` here too, so we
    // re-attach those known mode values after the filter sync to keep the
    // selected view sticky across filter mutations.
    const currentView = searchParams.get('view');
    if (currentView === 'pipeline' || currentView === 'inbox' || currentView === 'table') {
      next.set('view', currentView);
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // Intentionally exclude searchParams/setSearchParams from deps to avoid
    // feedback loops; we only react to local filter state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, searchQuery, activeFilters, onlyMine, includeChurned, customPropsFilter, sortBy, sortDir, groupBy, visibleColumns]);

  // Hydrate filter + display state from a saved view (e.g. when opened from
  // /views/:id). Runs whenever the active saved view id changes.
  useEffect(() => {
    if (!activeSavedView) return;
    const f = activeSavedView.filters as any;
    if (typeof f.search === 'string') setSearchQuery(f.search);
    if (Array.isArray(f.health)) setActiveFilters(p => ({ ...p, health: new Set(f.health) }));
    if (Array.isArray(f.segment)) setActiveFilters(p => ({ ...p, segment: new Set(f.segment) }));
    // Guarded like the two above: views saved before the owner split carry
    // neither owner key, and `new Set(undefined)` would throw here.
    if (Array.isArray(f.revenueOwner)) setActiveFilters(p => ({ ...p, revenueOwner: new Set(f.revenueOwner) }));
    if (Array.isArray(f.deliveryOwner)) setActiveFilters(p => ({ ...p, deliveryOwner: new Set(f.deliveryOwner) }));
    if (typeof f.myAccounts === 'boolean') setOnlyMine(f.myAccounts);
    if (typeof f.includeChurned === 'boolean') setIncludeChurned(f.includeChurned);
    if (typeof f.sortBy === 'string') setSortBy(f.sortBy as SortKey);
    if (f.sortDir === 'asc' || f.sortDir === 'desc') setSortDir(f.sortDir);
    if (typeof f.groupBy === 'string') setGroupBy(f.groupBy as GroupByKey);
    if (Array.isArray(f.visibleColumns) && f.visibleColumns.length) {
      setVisibleColumns(new Set(f.visibleColumns));
    }
    if (f.customProps && typeof f.customProps === 'object') setCustomPropsFilter(f.customProps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSavedView?.id, activeSavedView?.updated_at]);

  // Auto-persist display option / column changes back to the saved view so
  // they survive a page refresh on /views/:id.
  useViewDisplayPersist(activeSavedView, {
    search: searchQuery,
    health: [...activeFilters.health],
    segment: [...activeFilters.segment],
    includeChurned,
    sortBy,
    sortDir,
    groupBy,
    visibleColumns: [...visibleColumns],
  });

  // Track which custom property column-keys are visible (key format: `cp:${propId}`)
  const customPropKey = (id: string) => `cp:${id}`;

  // Prefetch all account-scoped queries the workspace needs.
  // Triggered on row hover (warmup) and click (fallback).
  const prefetchedRef = useRef<Set<string>>(new Set());
  const prefetchAccount = useCallback((accountId: string) => {
    if (!orgId || !accountId) return;
    if (prefetchedRef.current.has(accountId)) return;
    prefetchedRef.current.add(accountId);
    const STALE = 30_000;
    qc.prefetchQuery({
      queryKey: ['contacts', orgId, accountId],
      staleTime: STALE,
      queryFn: async () => {
        const { data } = await db.from('contacts').select('*')
          .eq('organization_id', orgId).eq('account_id', accountId)
          .order('created_at', { ascending: false });
        return data || [];
      },
    });
    qc.prefetchQuery({
      queryKey: ['projects', orgId, accountId],
      staleTime: STALE,
      queryFn: async () => {
        const { data } = await db.from('projects').select('*')
          .eq('organization_id', orgId).eq('account_id', accountId)
          .order('created_at', { ascending: false });
        return data || [];
      },
    });
    qc.prefetchQuery({
      queryKey: ['tasks', null, orgId, accountId, false],
      staleTime: STALE,
      queryFn: async () => {
        const { data } = await db.from('tasks').select('*')
          .eq('organization_id', orgId).eq('account_id', accountId)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true });
        return data || [];
      },
    });
    qc.prefetchQuery({
      queryKey: ['events', orgId, accountId],
      staleTime: STALE,
      queryFn: async () => {
        const { data } = await db
          .from('events')
          .select('*, event_contacts(contact_id)')
          .eq('organization_id', orgId).eq('account_id', accountId)
          .order('scheduled_at', { ascending: false, nullsFirst: false })
          .order('date', { ascending: false });
        return ((data || []) as any[]).map((e: any) => ({
          ...e,
          contact_ids: (e.event_contacts || []).map((ec: any) => ec.contact_id),
        }));
      },
    });
    qc.prefetchQuery({
      queryKey: ['lifecycle-history', orgId, accountId],
      staleTime: STALE,
      queryFn: async () => {
        const { data } = await db.from('events')
          .select('id, title, summary, date, created_at, group_label, account_id, organization_id')
          .eq('organization_id', orgId).eq('account_id', accountId)
          .eq('group_label', 'lifecycle')
          .order('created_at', { ascending: true });
        return data || [];
      },
    });
    qc.prefetchQuery({ ...healthLogsQuery(accountId), staleTime: STALE });
  }, [orgId, qc]);

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const isColVisible = (key: string) => visibleColumns.has(key);

  const [form, setForm] = useState(defaultAccount);
  // Custom property draft values (keyed by property_id) for create/edit dialog
  const [customDraft, setCustomDraft] = useState<Record<string, any>>({});

  // Owner uuid -> display name, resolved once for the whole table.
  const memberNames = useMemo(() => {
    const m = new Map<string, string>();
    orgMembers.forEach((x) => m.set(x.user_id, x.display_name || 'Unnamed'));
    return m;
  }, [orgMembers]);
  const nameFor = useCallback(
    (id: string | null) => (id ? memberNames.get(id) ?? 'Unnamed' : ''),
    [memberNames],
  );
  const allRows = useMemo(() => buildRows(accounts, nameFor), [accounts, nameFor]);
  const accountIds = useMemo(() => allRows.map(r => r.id), [allRows]);
  // Inbox mode doesn't render any custom-property columns — skip the bulk fetch.
  const customValuesByAccount = useCustomPropertyValuesBulk('account', isInboxMode ? [] : accountIds, customProps);
  const accountById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
  const visibleCustomProps = useMemo(
    () => customProps.filter(p =>
      !(p.is_system && (p.key === 'segment' || p.key === 'arr'))
      && isColVisible(customPropKey(p.id))
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customProps, visibleColumns],
  );

  // Latest-vs-previous health trend per account (shared with the pipeline cards).
  const { trends: healthTrends } = useHealthTrends({ enabled: !isInboxMode });

  // The owner slice of the filter state, in the shape matchesOwnerFilters wants.
  const ownerFilterArgs = useMemo(() => ({
    revenueOwner: [...activeFilters.revenueOwner],
    deliveryOwner: [...activeFilters.deliveryOwner],
    myAccounts: onlyMine,
  }), [activeFilters.revenueOwner, activeFilters.deliveryOwner, onlyMine]);

  // Compute filter counts from real data
  const filterCounts = useMemo(() => {
    const health: Record<string, number> = { Healthy: 0, Concerning: 0, 'At Risk': 0 };
    const segment: Record<string, number> = {};
    const revenueOwner: Record<string, number> = {};
    const deliveryOwner: Record<string, number> = {};
    allRows.forEach(r => {
      health[healthLabel[r.healthStatus]]++;
      segment[r.segment] = (segment[r.segment] || 0) + 1;
      const rk = r.revenueOwnerId ?? '__unassigned';
      const dk = r.deliveryOwnerId ?? '__unassigned';
      revenueOwner[rk] = (revenueOwner[rk] || 0) + 1;
      deliveryOwner[dk] = (deliveryOwner[dk] || 0) + 1;
    });
    return { health, segment, revenueOwner, deliveryOwner };
  }, [allRows]);

  // Apply filters & sorting
  const rows = useMemo(() => {
    let filtered = allRows;
    if (!includeChurned) {
      // Enum value, not the legacy 'Churned' label — see applyAccountFilters.
      filtered = filtered.filter(r => r.lifecycleStage !== 'churned');
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r => r.name.toLowerCase().includes(q) || r.segment.toLowerCase().includes(q));
    }
    if (activeFilters.health.size > 0) {
      filtered = filtered.filter(r => activeFilters.health.has(healthLabel[r.healthStatus]));
    }
    if (activeFilters.segment.size > 0) {
      filtered = filtered.filter(r => activeFilters.segment.has(r.segment));
    }
    // One shared predicate with the board below and with applyAccountFilters
    // (export / Views counts) — three copies would drift.
    filtered = filtered.filter(r => matchesOwnerFilters(
      { revenue_owner_id: r.revenueOwnerId, delivery_owner_id: r.deliveryOwnerId },
      ownerFilterArgs,
      profile?.user_id,
    ));
    for (const [propId, selected] of Object.entries(customPropsFilter)) {
      if (!selected.length) continue;
      filtered = filtered.filter(r => {
        const val = customValuesByAccount[r.id]?.[propId];
        if (val == null) return false;
        const vals = Array.isArray(val) ? val.map(String) : [String(val)];
        return vals.some(v => selected.includes(v));
      });
    }
    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name': return dir * a.name.localeCompare(b.name);
        case 'arr': return dir * (a.arr - b.arr);
        case 'healthScore': return dir * (a.healthScore - b.healthScore);
        case 'lastSeen': {
          const ta = a.rawUpdatedAt ? new Date(a.rawUpdatedAt).getTime() : 0;
          const tb = b.rawUpdatedAt ? new Date(b.rawUpdatedAt).getTime() : 0;
          return dir * (ta - tb);
        }
        default: return 0;
      }
    });
    return filtered;
  }, [allRows, searchQuery, activeFilters, ownerFilterArgs, profile?.user_id, includeChurned, customPropsFilter, customValuesByAccount, sortBy, sortDir]);

  const filteredPipelineAccounts = useMemo(() => {
    if (accountsViewMode !== 'pipeline') return accounts;
    let result = accounts;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q));
    }
    if (activeFilters.health.size > 0) {
      result = result.filter(a => {
        const score = a.healthScore;
        const hasData = score > 0;
        const status: 'healthy' | 'concerning' | 'poor' | 'no_data' = !hasData ? 'no_data' :
          score >= 70 ? 'healthy' : score >= 40 ? 'concerning' : 'poor';
        return activeFilters.health.has(healthLabel[status]);
      });
    }
    if (activeFilters.segment.size > 0) {
      result = result.filter(a => activeFilters.segment.has(a.segment));
    }
    result = result.filter(a => matchesOwnerFilters(a, ownerFilterArgs, profile?.user_id));
    if (!includeChurned) {
      result = result.filter(a => a.lifecycleStage !== 'Churned');
    }
    for (const [propId, selected] of Object.entries(customPropsFilter)) {
      if (!selected.length) continue;
      result = result.filter(a => {
        const val = customValuesByAccount[a.id]?.[propId];
        if (val == null) return false;
        const vals = Array.isArray(val) ? val.map(String) : [String(val)];
        return vals.some(v => selected.includes(v));
      });
    }
    return result;
  }, [accounts, accountsViewMode, searchQuery, activeFilters, ownerFilterArgs, profile?.user_id, includeChurned, customPropsFilter, customValuesByAccount]);

  const totalARR = useMemo(() => rows.reduce((s, r) => s + r.arr, 0), [rows]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  /**
   * Single source of truth for the table's *data* columns (everything between
   * the leading checkbox+Account cells and the trailing actions cell).
   * Header, body rows, skeleton rows, and colSpan all derive from this list,
   * so toggling visibility or adding a custom prop can never desync them and
   * cause a layout jump during the filter-update pulse.
   */
  const tableDataColumns = useMemo(() => {
    type Col = { key: string; label: string; skeletonWidth: string };
    const cols: Col[] = [];
    if (isColVisible('segment')) cols.push({ key: 'segment', label: 'Segment', skeletonWidth: 'w-16' });
    if (isColVisible('health')) cols.push({ key: 'health', label: 'Health', skeletonWidth: 'w-12' });
    if (isColVisible('arr')) cols.push({ key: 'arr', label: 'Potential ARR', skeletonWidth: 'w-20' });
    if (isColVisible('lastSeen')) cols.push({ key: 'lastSeen', label: 'Last Seen', skeletonWidth: 'w-16' });
    if (isColVisible('lastInteraction')) cols.push({ key: 'lastInteraction', label: 'Last Interaction', skeletonWidth: 'w-16' });
    // Customer-phase columns, driven off the same registry the body cells use so
    // header order and cell order cannot drift apart (src/lib/customerColumns.ts).
    for (const c of CUSTOMER_COLUMNS) {
      if (isColVisible(c.key)) {
        cols.push({ key: c.key, label: c.label, skeletonWidth: c.skeletonWidth });
      }
    }
    for (const p of customProps) {
      if (p.is_system && (p.key === 'segment' || p.key === 'arr')) continue;
      if (!isColVisible(customPropKey(p.id))) continue;
      cols.push({ key: `cp-${p.id}`, label: p.label, skeletonWidth: 'w-16' });
    }
    return cols;
  }, [visibleColumns, customProps]);

  const grouped = useMemo(() => {
    if (groupBy === 'none') return { '': rows };
    const groups: Record<string, AccountRow[]> = {};
    rows.forEach(r => {
      const acct = accountById.get(r.id);
      const key = getGroupValue(r, acct, groupBy);
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [rows, accountById, groupBy]);

  const viewMode = groupBy === 'none' ? 'table' : 'board';

  function openCreate() {
    setForm({ ...defaultAccount });
    setCustomDraft({});
    setDialogOpen(true);
  }

  function openEdit(id: string) {
    navigate(`/account/${id}`);
  }

  async function persistCustomValues(accountId: string) {
    if (!profile?.organization_id || customProps.length === 0) return;
    // Split: system props go to the accounts row, custom props go to custom_property_values.
    const systemPatch: Partial<Account> = {};
    const customRows: any[] = [];
    Object.entries(customDraft).forEach(([propId, value]) => {
      const p = customProps.find(cp => cp.id === propId);
      if (!p) return;
      if (p.is_system && isSystemAccountKey(p.key)) {
        const field = SYSTEM_KEY_TO_ACCOUNT_FIELD[p.key];
        (systemPatch as any)[field] = value ?? '';
        if (p.key === 'mrr') (systemPatch as any).arr = Number(value) * 12;
      } else {
        customRows.push({
          organization_id: profile.organization_id!,
          property_id: propId,
          entity_type: 'account' as const,
          entity_id: accountId,
          value,
        });
      }
    });
    if (Object.keys(systemPatch).length > 0) {
      await updateAccount(accountId, systemPatch);
    }
    if (customRows.length > 0) {
      await db.from('custom_property_values').upsert(customRows, { onConflict: 'property_id,entity_id' });
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    let created: Account | null;
    try {
      created = await addAccount({ ...form, arr: form.mrr * 12 });
    } catch (e) {
      created = null;
    }
    const newId = (created as any)?.id;
    // Don't close the dialog on failure — surface it so a silent insert error
    // (e.g. a constraint rejection) can't masquerade as a successful create.
    if (!newId) {
      toast.error("Couldn't create the account. Please try again.");
      return;
    }
    await persistCustomValues(newId);
    setDialogOpen(false);
    toast.success(`Account "${form.name.trim()}" created`, {
      action: {
        label: 'View details',
        onClick: () => navigate(`/account/${newId}`),
      },
    });
  }

  function handleDelete() {
    if (deleteId) {
      deleteAccount(deleteId);
      selected.delete(deleteId);
      setSelected(new Set(selected));
      setDeleteId(null);
    }
  }

  function updateForm(patch: Partial<Omit<Account, 'id'>>) {
    setForm(prev => ({ ...prev, ...patch }));
  }

  const customPropFilterItems = useMemo(
    () => customProps
      .filter(p => p.type === 'select' || p.type === 'multi_select')
      .map(p => ({
        property: p,
        selected: customPropsFilter[p.id] ?? [],
        onChange: (vals: string[]) =>
          setCustomPropsFilter(prev => ({ ...prev, [p.id]: vals })),
      })),
    [customProps, customPropsFilter],
  );

  const customPropActiveCount = Object.values(customPropsFilter).filter(v => v.length > 0).length;
  const activeFilterCount = (activeFilters.health.size > 0 ? 1 : 0) + (activeFilters.segment.size > 0 ? 1 : 0) + (activeFilters.revenueOwner.size > 0 ? 1 : 0) + (activeFilters.deliveryOwner.size > 0 ? 1 : 0) + (onlyMine ? 1 : 0) + (includeChurned ? 1 : 0) + customPropActiveCount;
  const hasActiveFilters = activeFilterCount > 0;

  const createFormProps = useMemo(() => visibleCreateProps(customProps), [customProps]);

  const healthOptions = [
    { value: 'Healthy', label: 'Healthy', count: filterCounts.health['Healthy'] || 0 },
    { value: 'Concerning', label: 'Concerning', count: filterCounts.health['Concerning'] || 0 },
    { value: 'At Risk', label: 'At Risk', count: filterCounts.health['At Risk'] || 0 },
  ];
  const segmentOptions = Object.entries(filterCounts.segment).map(([label, count]) => ({ value: label, label, count }));
  // Same list for both roles: everyone in the org can hold either. '__unassigned'
  // leads, matching the sentinel the project filters already use.
  const ownerOptions = useMemo(() => [
    {
      value: '__unassigned',
      label: 'Unassigned',
      count: (filterCounts.revenueOwner['__unassigned'] || 0) + (filterCounts.deliveryOwner['__unassigned'] || 0),
    },
    ...orgMembers.map((m) => ({
      value: m.user_id,
      label: m.display_name || 'Unnamed',
      count: (filterCounts.revenueOwner[m.user_id] || 0) + (filterCounts.deliveryOwner[m.user_id] || 0),
    })),
  ], [orgMembers, filterCounts]);

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          {draftActive ? (
            <ViewDraftHeader
              entity="accounts"
              currentFilters={{
                search: searchQuery,
                health: [...activeFilters.health],
                segment: [...activeFilters.segment],
                includeChurned,
                sortBy,
                sortDir,
                groupBy,
                visibleColumns: [...visibleColumns],
              }}
              accountMap={Object.fromEntries(accounts.map(a => [a.id, a.name]))}
              existingView={isEditMode ? activeSavedView : null}
              onDisplayChange={(patch: any) => {
                if (patch.sortBy !== undefined) setSortBy(patch.sortBy);
                if (patch.sortDir !== undefined) setSortDir(patch.sortDir);
                if (patch.groupBy !== undefined) setGroupBy(patch.groupBy);
                if (patch.includeChurned !== undefined) setIncludeChurned(patch.includeChurned);
                if (patch.visibleColumns !== undefined) setVisibleColumns(new Set(patch.visibleColumns));
              }}
              activeFilterCount={
                (activeFilters.health.size > 0 ? 1 : 0) +
                (activeFilters.segment.size > 0 ? 1 : 0) +
                (activeFilters.revenueOwner.size > 0 ? 1 : 0) +
                (activeFilters.deliveryOwner.size > 0 ? 1 : 0) +
                (onlyMine ? 1 : 0) +
                (includeChurned ? 1 : 0)
              }
              filterSlot={
                <FilterPopover
                  activeCount={
                    (activeFilters.health.size > 0 ? 1 : 0) +
                    (activeFilters.segment.size > 0 ? 1 : 0) +
                    (activeFilters.revenueOwner.size > 0 ? 1 : 0) +
                    (activeFilters.deliveryOwner.size > 0 ? 1 : 0) +
                    (onlyMine ? 1 : 0) +
                    (includeChurned ? 1 : 0)
                  }
                >
                  <FiltersAccountsSection
                    healthOptions={healthOptions}
                    segmentOptions={segmentOptions}
                    ownerOptions={ownerOptions}
                    healthFilter={[...activeFilters.health]}
                    segmentFilter={[...activeFilters.segment]}
                    revenueOwnerFilter={[...activeFilters.revenueOwner]}
                    deliveryOwnerFilter={[...activeFilters.deliveryOwner]}
                    onlyMine={onlyMine}
                    includeChurned={includeChurned}
                    onHealthChange={(next) => setActiveFilters(p => ({ ...p, health: new Set(next) }))}
                    onSegmentChange={(next) => setActiveFilters(p => ({ ...p, segment: new Set(next) }))}
                    onRevenueOwnerChange={(next) => setActiveFilters(p => ({ ...p, revenueOwner: new Set(next) }))}
                    onDeliveryOwnerChange={(next) => setActiveFilters(p => ({ ...p, deliveryOwner: new Set(next) }))}
                    onOnlyMineChange={setOnlyMine}
                    onIncludeChurnedChange={setIncludeChurned}
                  />
                </FilterPopover>
              }
            />
          ) : (
          <PageHeader
            title="All Accounts"
            description={accountsLoading
              ? 'Loading accounts…'
              : `${rows.length} accounts · ${formatCurrency(totalARR)} Potential ARR`}
            chip={activeSavedView ? <ViewPill name={activeSavedView.name} /> : null}
            actions={
              <div className="flex items-center gap-2">
                {activeSavedView && (
                  <ExportViewButton
                    entity="accounts"
                    filters={{
                      search: searchQuery,
                      health: [...activeFilters.health],
                      segment: [...activeFilters.segment],
                      revenueOwner: [...activeFilters.revenueOwner],
                      deliveryOwner: [...activeFilters.deliveryOwner],
                      myAccounts: onlyMine,
                      includeChurned, sortBy, sortDir, groupBy,
                      visibleColumns: [...visibleColumns],
                    } as any}
                    viewName={activeSavedView.name}
                  />
                )}
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Account
                </Button>
              </div>
            }
          />
          )}

          {/* Unified toolbar — 2nd band */}
          {!draftActive && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 sm:px-6 py-1.5 border-b bg-background/95 backdrop-blur-sm">
              <AccountsViewSwitcher mode={accountsViewMode} onChange={setAccountsViewMode} />

              {accountsViewMode !== 'inbox' && (
                <>
                  <div className="w-px h-4 bg-border mx-0.5" />
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      className="h-7 pl-7 pr-2 text-[12px] bg-muted/40 border border-transparent rounded-md w-44 placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:bg-background transition-colors"
                      placeholder="Search accounts…"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                </>
              )}

              {accountsViewMode === 'inbox' && (
                <>
                  <div className="w-px h-4 bg-border mx-0.5" />
                  <Select
                    value={searchParams.get('account') || 'all'}
                    onValueChange={(v) => {
                      const next = new URLSearchParams(searchParams);
                      if (v === 'all') next.delete('account'); else next.set('account', v);
                      setSearchParams(next, { replace: true });
                    }}
                  >
                    <SelectTrigger className="h-7 text-[11px] w-[180px]">
                      <SelectValue placeholder="All accounts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All accounts</SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}

              <div className="flex-1" />

              {accountsViewMode !== 'inbox' && (
                <span className="text-[11px] text-muted-foreground">
                  {isFilterUpdating
                    ? 'Updating…'
                    : accountsViewMode === 'pipeline'
                      ? `${filteredPipelineAccounts.length} accounts`
                      : `${rows.length}${rows.length !== allRows.length ? ` of ${allRows.length}` : ''} results`}
                </span>
              )}

              {accountsViewMode !== 'inbox' && (
                <>
                  <div className="w-px h-4 bg-border mx-0.5" />
                  <div className="flex items-center gap-0.5">
                    <FilterPopover activeCount={activeFilterCount}>
                      <FiltersAccountsSection
                        healthOptions={healthOptions}
                        segmentOptions={segmentOptions}
                    ownerOptions={ownerOptions}
                        healthFilter={[...activeFilters.health]}
                        segmentFilter={[...activeFilters.segment]}
                    revenueOwnerFilter={[...activeFilters.revenueOwner]}
                    deliveryOwnerFilter={[...activeFilters.deliveryOwner]}
                    onlyMine={onlyMine}
                        includeChurned={includeChurned}
                        onHealthChange={(next) => setActiveFilters(p => ({ ...p, health: new Set(next) }))}
                        onSegmentChange={(next) => setActiveFilters(p => ({ ...p, segment: new Set(next) }))}
                    onRevenueOwnerChange={(next) => setActiveFilters(p => ({ ...p, revenueOwner: new Set(next) }))}
                    onDeliveryOwnerChange={(next) => setActiveFilters(p => ({ ...p, deliveryOwner: new Set(next) }))}
                    onOnlyMineChange={setOnlyMine}
                        onIncludeChurnedChange={setIncludeChurned}
                        customPropFilters={customPropFilterItems}
                      />
                    </FilterPopover>

                    <DisplayOptionsPopover
                      entity="accounts"
                      value={{
                        search: searchQuery,
                        health: [...activeFilters.health],
                        segment: [...activeFilters.segment],
                        revenueOwner: [...activeFilters.revenueOwner],
                        deliveryOwner: [...activeFilters.deliveryOwner],
                        myAccounts: onlyMine,
                        includeChurned, sortBy, sortDir, groupBy,
                        visibleColumns: [...visibleColumns],
                      } as any}
                      onChange={(patch: any) => {
                        if (patch.sortBy !== undefined) setSortBy(patch.sortBy);
                        if (patch.sortDir !== undefined) setSortDir(patch.sortDir);
                        if (patch.groupBy !== undefined) setGroupBy(patch.groupBy);
                        if (patch.visibleColumns !== undefined) setVisibleColumns(new Set(patch.visibleColumns));
                      }}
                      hasActiveState={groupBy !== 'none' || sortBy !== 'healthScore'}
                    />
                  </div>
                </>
              )}

              {accountsViewMode === 'table' && (
                <>
                  <div className="w-px h-4 bg-border mx-0.5" />
                  <SaveViewButton
                    entity="accounts"
                    filters={{
                      search: searchQuery,
                      health: [...activeFilters.health],
                      segment: [...activeFilters.segment],
                      revenueOwner: [...activeFilters.revenueOwner],
                      deliveryOwner: [...activeFilters.deliveryOwner],
                      myAccounts: onlyMine,
                      includeChurned, sortBy, sortDir, groupBy,
                      visibleColumns: [...visibleColumns],
                      customProps: customPropsFilter,
                    }}
                  />
                </>
              )}
            </div>
          )}

          {/* Active filter chip strip */}
          {!draftActive && accountsViewMode !== 'inbox' && hasActiveFilters && (
            <div className="flex items-center gap-1.5 flex-wrap px-6 py-1.5 border-b">
              <FilterChipGroup
                label="Health"
                values={[...activeFilters.health].map(v => ({ value: v, label: v }))}
                onRemove={(v) => setActiveFilters(p => { const n = new Set(p.health); n.delete(v); return { ...p, health: n }; })}
                onClearAll={() => setActiveFilters(p => ({ ...p, health: new Set() }))}
              />
              <FilterChipGroup
                label="Segment"
                values={[...activeFilters.segment].map(v => ({ value: v, label: v }))}
                onRemove={(v) => setActiveFilters(p => { const n = new Set(p.segment); n.delete(v); return { ...p, segment: n }; })}
                onClearAll={() => setActiveFilters(p => ({ ...p, segment: new Set() }))}
              />
              <FilterChipGroup
                label="Revenue owner"
                values={[...activeFilters.revenueOwner].map(v => ({ value: v, label: v === '__unassigned' ? 'Unassigned' : nameFor(v) || v }))}
                onRemove={(v) => setActiveFilters(p => { const n = new Set(p.revenueOwner); n.delete(v); return { ...p, revenueOwner: n }; })}
                onClearAll={() => setActiveFilters(p => ({ ...p, revenueOwner: new Set() }))}
              />
              <FilterChipGroup
                label="Delivery owner"
                values={[...activeFilters.deliveryOwner].map(v => ({ value: v, label: v === '__unassigned' ? 'Unassigned' : nameFor(v) || v }))}
                onRemove={(v) => setActiveFilters(p => { const n = new Set(p.deliveryOwner); n.delete(v); return { ...p, deliveryOwner: n }; })}
                onClearAll={() => setActiveFilters(p => ({ ...p, deliveryOwner: new Set() }))}
              />
              {onlyMine && (
                <button
                  onClick={() => setOnlyMine(false)}
                  className="inline-flex items-center gap-1 h-5 px-1.5 rounded-sm bg-accent text-[11px] hover:bg-accent/70 transition-colors"
                >
                  My accounts <X className="h-2.5 w-2.5" />
                </button>
              )}
              {includeChurned && (
                <button
                  onClick={() => setIncludeChurned(false)}
                  className="inline-flex items-center gap-1 h-5 px-1.5 rounded-sm bg-accent text-[11px] hover:bg-accent/70 transition-colors"
                >
                  Churned <X className="h-2.5 w-2.5" />
                </button>
              )}
              {customPropFilterItems.filter(item => item.selected.length > 0).map(item => (
                <FilterChipGroup
                  key={item.property.id}
                  label={item.property.label}
                  values={item.selected.map(v => ({ value: v, label: v }))}
                  onRemove={(v) => item.onChange(item.selected.filter(s => s !== v))}
                  onClearAll={() => item.onChange([])}
                />
              ))}
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActiveFilters({ health: new Set(), segment: new Set(), revenueOwner: new Set(), deliveryOwner: new Set() });
                  setOnlyMine(false);
                  setIncludeChurned(false);
                  setCustomPropsFilter({});
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline"
              >
                Clear all
              </button>
            </div>
          )}

          {accountsViewMode === 'table' && (
            <AccountsTableView
              rows={rows}
              allRows={allRows}
              grouped={grouped}
              accountById={accountById}
              customProps={customProps}
              visibleCustomProps={visibleCustomProps}
              customValuesByAccount={customValuesByAccount}
              tableDataColumns={tableDataColumns}
              healthTrends={healthTrends}
              viewMode={viewMode}
              groupBy={groupBy}
              isFilterUpdating={isFilterUpdating}
              loading={accountsLoading}
              isColVisible={isColVisible}
              currencySymbol={currencySymbol}
              formatCurrency={formatCurrency}
              getCustomerSignals={getCustomerSignals}
              selected={selected}
              allSelected={allSelected}
              toggle={toggle}
              toggleAll={toggleAll}
              navigate={navigate}
              prefetchAccount={prefetchAccount}
              openCreate={openCreate}
              openEdit={openEdit}
              setDeleteId={setDeleteId}
            />
          )}
          {accountsViewMode === 'pipeline' && (
            <AccountsPipelineView accounts={filteredPipelineAccounts} />
          )}
          {accountsViewMode === 'inbox' && (
            <>
              {/*
                CostCapBanner self-renders nothing when the org is under cap,
                so the px-6 pt-4 wrapper only adds layout when polling is
                actually paused. AccountsInboxView already owns its own
                horizontal/bottom padding (px-6 pb-6), so we only pad the
                banner above it to align horizontally and breathe from the
                page header.
              */}
              <div className="px-6 pt-4">
                <CostCapBanner />
              </div>
              <AccountsInboxView />
            </>
          )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Add Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 -mx-6 px-6">
            <div>
              <label className="text-[11px] font-medium text-foreground/70">Name *</label>
              <Input className="h-7 text-[13px] mt-1" value={form.name} onChange={e => updateForm({ name: e.target.value })} />
            </div>
            {createFormProps.length > 0 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {createFormProps.map(p => (
                  <div key={p.id} className={p.type === 'text' ? 'col-span-2' : ''}>
                    <label className="text-[11px] font-medium text-foreground/70">
                      {p.label}{p.is_required && <span className="text-destructive ml-0.5">*</span>}
                    </label>
                    <div className="mt-1">
                      <PropertyField
                        property={p}
                        value={customDraft[p.id]}
                        onChange={(v) => setCustomDraft(prev => ({ ...prev, [p.id]: v }))}
                        size="sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSave}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the account and all associated data. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
