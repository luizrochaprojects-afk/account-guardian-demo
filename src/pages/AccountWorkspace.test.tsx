import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const logInteractionMock = vi.hoisted(() => vi.fn());
const mockAccount = vi.hoisted(() => ({
  current: {
    id: 'a1', name: 'Bluebird Health', industry: 'Fintech', segment: 'Mid-Market', trend: 'flat',
    healthScore: 0, pipeline_stage: 'target', pipeline_phase: 'sdr', stage_changed_at: null,
    founder_confidence: null, createdAt: null, mrr: 0, arr: 0,
  } as any,
}));

vi.mock('@/contexts/AccountsContext', () => ({
  useAccounts: () => ({
    getAccount: () => mockAccount.current,
    updateAccount: vi.fn(), loading: false,
  }),
}));
vi.mock('@/contexts/HealthConfigContext', () => ({ useHealthConfig: () => ({ metrics: [] }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: { organization_id: 'org1' } }) }));
vi.mock('@/hooks/useContactsDB', () => ({ useContactsDB: () => ({ contacts: [] }) }));
vi.mock('@/hooks/useOrgSettings', () => ({ useOrgSettings: () => ({ currencySymbol: '$', currencyCode: 'USD' }) }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/components/account/AccountAgentNotice', () => ({ AccountAgentNotice: () => null }));
vi.mock('@/components/account/AccountOverview', () => ({ AccountOverview: () => <div>overview-content</div> }));
vi.mock('@/components/account/AccountIssuesTab', () => ({ AccountIssuesTab: () => <div>issues-content</div> }));
vi.mock('@/components/account/LogInteractionDialog', () => ({
  LogInteractionDialog: (props: { open: boolean }) => { logInteractionMock(props); return null; },
}));
vi.mock('@/components/account/ContactDialog', () => ({ ContactDialog: () => null }));
vi.mock('@/components/account/CompanyInfoPanel', () => ({ CompanyInfoPanel: () => null }));
vi.mock('@/components/account/LifecycleHistoryDialog', () => ({ LifecycleHistoryDialog: () => null }));
vi.mock('@/hooks/useSystemPropertyOptions', () => ({ useSystemPropertyOptions: () => ({ options: [] }) }));
vi.mock('@/hooks/useRole', () => ({ useRole: () => ({ isFounder: false }) }));
vi.mock('@/components/accounts/StageReasonModal', () => ({ StageReasonModal: () => null }));

const { default: AccountWorkspace } = await import('./AccountWorkspace');

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="/accounts/:id" element={<AccountWorkspace />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderAtWithLocationProbe(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
        <Routes><Route path="/accounts/:id" element={<AccountWorkspace />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AccountWorkspace', () => {
  beforeEach(() => {
    mockAccount.current = {
      id: 'a1', name: 'Bluebird Health', industry: 'Fintech', segment: 'Mid-Market', trend: 'flat',
      healthScore: 0, pipeline_stage: 'target', pipeline_phase: 'sdr', stage_changed_at: null,
      founder_confidence: null, createdAt: null, mrr: 0, arr: 0,
    };
  });

  it('hides Health pre-sale, and drops the Relationships tab entirely', () => {
    // The mock account is stage 'target' -> phase 'sdr', i.e. pre-sale.
    renderAt('/accounts/a1');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual(['Overview', 'Sales', 'Issues']);
  });
  it('keeps Health hidden through the sales phase', () => {
    mockAccount.current = { ...mockAccount.current, pipeline_stage: 'business_case', pipeline_phase: 'sales' };
    renderAt('/accounts/a1');
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Overview', 'Sales', 'Issues']);
  });
  it('shows Health once the account is past close, and no other extra tab', () => {
    mockAccount.current = { ...mockAccount.current, pipeline_stage: 'steady', pipeline_phase: 'customer' };
    renderAt('/accounts/a1');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual(['Overview', 'Sales', 'Issues', 'Health']);
  });
  it('shows Health from onboarding on', () => {
    mockAccount.current = { ...mockAccount.current, pipeline_stage: 'setup', pipeline_phase: 'onboarding' };
    renderAt('/accounts/a1');
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Overview', 'Sales', 'Issues', 'Health']);
  });
  it('?tab=delivery (the old name) lands on Issues', () => {
    renderAt('/accounts/a1?tab=delivery');
    expect(screen.getByRole('tab', { name: 'Issues' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('issues-content')).toBeInTheDocument();
  });
  it('?tab=archive and ?tab=customer (unknown tabs) fall back to Overview', () => {
    mockAccount.current = { ...mockAccount.current, pipeline_stage: 'steady', pipeline_phase: 'customer' };
    renderAt('/accounts/a1?tab=archive');
    expect(screen.getByText('overview-content')).toBeInTheDocument();
    renderAt('/accounts/a1?tab=customer');
    expect(screen.getAllByText('overview-content').length).toBe(2);
  });
  it('account name appears at most twice (breadcrumb leaf + header title)', () => {
    // EditableTitle doesn't render a `heading` role, so we assert on text
    // occurrences instead: the breadcrumb current-page label plus the
    // AccountHeader title both legitimately show the account name.
    renderAt('/accounts/a1');
    expect(screen.getAllByText('Bluebird Health').length).toBeLessThanOrEqual(2);
  });
  it('?tab=relationships (and legacy ?tab=contacts) redirect to Overview — that content lives there now', () => {
    renderAt('/accounts/a1?tab=relationships');
    expect(screen.getByText('overview-content')).toBeInTheDocument();
    renderAt('/accounts/a1?tab=contacts');
    expect(screen.getAllByText('overview-content').length).toBeGreaterThan(0);
  });
  it('?action=log-interaction opens the dialog and strips the param', async () => {
    renderAtWithLocationProbe('/accounts/a1?action=log-interaction');

    await waitFor(() => {
      expect(logInteractionMock).toHaveBeenCalledWith(expect.objectContaining({ open: true }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('location-search').textContent).toBe('');
    });
  });
});
