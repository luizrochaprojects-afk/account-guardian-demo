import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CustomProperty } from '@/hooks/useCustomProperties';

// Mutable across tests: some cases need the ACCOUNT group populated, the
// original cases assert on the Commercial group with no custom properties.
const mocks = vi.hoisted(() => ({
  properties: [] as CustomProperty[],
  value: null as unknown,
  setValue: vi.fn(),
}));

vi.mock('@/hooks/useCustomProperties', () => ({ useCustomProperties: () => ({ properties: mocks.properties }) }));
vi.mock('@/hooks/useAccountFieldValue', () => ({
  useAccountFieldValue: () => ({ value: mocks.value, setValue: mocks.setValue, isCustom: false }),
}));
vi.mock('@/hooks/useOrgSettings', () => ({ useOrgSettings: () => ({ currencySymbol: '$', currencyCode: 'USD' }) }));
vi.mock('./AccountContacts', () => ({ AccountContacts: () => null }));
// CommercialSection deps — inline editors for Stage/Close/ARR/Owner/Source.
vi.mock('@/contexts/AccountsContext', () => ({ useAccounts: () => ({ updateAccount: vi.fn() }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: { organization_id: 'org1' } }) }));
vi.mock('@/hooks/useStageTransition', () => ({
  useStageTransition: () => ({
    requestStageChange: vi.fn(), reasonGatedStage: null, reasonGatedAccount: null, closeReasonModal: vi.fn(),
  }),
}));
vi.mock('@/components/accounts/StageReasonModal', () => ({ StageReasonModal: () => null }));
vi.mock('@/demo/db', () => ({
  db: {
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
  },
}));

const { CompanyInfoPanel } = await import('./CompanyInfoPanel');

const account = { id: 'a1', pipeline_stage: 'target', expected_close_date: null, arr: 0, mrr: 0, revenue_owner_id: null, delivery_owner_id: null, source: null } as any;

function prop(over: Partial<CustomProperty>): CustomProperty {
  return {
    id: 'p1', organization_id: 'org1', entity_type: 'account', key: 'segment', label: 'Segment',
    type: 'select', options: ['SMB', 'Enterprise'], description: null, is_required: false,
    is_system: true, show_in_create: true, default_value: null, position: 0,
    created_at: '', updated_at: '', ...over,
  } as CustomProperty;
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><CompanyInfoPanel account={account} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.properties = [];
  mocks.value = null;
  mocks.setValue = vi.fn();
});

describe('CompanyInfoPanel', () => {

  // One close date on screen at a time. The two were near-synonyms sitting next
  // to each other and nobody could tell which to fill.
  it('shows only the seller forecast while the deal is open', () => {
    account.pipeline_stage = 'business_case';
    account.pipeline_phase = 'sales';
    renderPanel();
    expect(screen.getByText('Forecast close')).toBeInTheDocument();
    expect(screen.queryByText('Closed on')).toBeNull();
    expect(screen.queryByText('Expected close')).toBeNull();
  });

  it('swaps to "Closed on" once the deal has closed', () => {
    account.pipeline_stage = 'closed_won';
    account.pipeline_phase = 'onboarding';
    renderPanel();
    expect(screen.getByText('Closed on')).toBeInTheDocument();
    expect(screen.queryByText('Forecast close')).toBeNull();
  });

  it('treats an exit stage as closed too', () => {
    account.pipeline_stage = 'closed_lost';
    account.pipeline_phase = 'sales';
    renderPanel();
    expect(screen.getByText('Closed on')).toBeInTheDocument();
    expect(screen.queryByText('Forecast close')).toBeNull();
  });
  it('groups Commercial fields with explicit empty texts', () => {
    renderPanel();
    expect(screen.getByText('Commercial')).toBeInTheDocument();
    expect(screen.getAllByText('Not set').length).toBeGreaterThanOrEqual(1);
    // Two owner rows (revenue and delivery), so "Not assigned" is expected
    // twice — once per role.
    expect(screen.getByText('Revenue owner')).toBeInTheDocument();
    expect(screen.getByText('Delivery owner')).toBeInTheDocument();
    expect(screen.getAllByText('Not assigned')).toHaveLength(2);
  });

  it('renders the Source field as editable', () => {
    renderPanel();
    const sourceRow = screen.getByRole('button', { name: /source/i });
    expect(sourceRow).toBeInTheDocument();
    expect(sourceRow).toHaveAttribute('tabIndex', '0');
  });
});

describe('CompanyInfoPanel — ACCOUNT property editors', () => {
  /**
   * Regression: the editor used to be wrapped in
   *   <div onBlur={() => setTimeout(() => setEditing(false), 150)}>
   * Radix portals the select menu, and React's onBlur is a *bubbling* focusout
   * that propagates along the React tree — portal included. So opening the menu
   * blurred the wrapper and unmounted the whole editor 150ms later, before a
   * click could land on an option.
   */
  it('keeps a select editor mounted when focus leaves for the portalled menu', async () => {
    mocks.properties = [prop({ key: 'segment', label: 'Segment' })];
    const { container } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /segment/i }));

    const trigger = container.querySelector('[role="combobox"]');
    expect(trigger).not.toBeNull();

    // Radix moves focus into the portal when the menu opens.
    fireEvent.focusOut(trigger!);
    await act(() => new Promise((r) => setTimeout(r, 250)));

    expect(container.querySelector('[role="combobox"]')).not.toBeNull();
  });

  it('keeps a multi_select editor mounted after one option is toggled', async () => {
    mocks.properties = [prop({ id: 'p2', key: 'channels', label: 'Channels', type: 'multi_select', options: ['Email', 'Chat'] })];
    mocks.value = [];
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /channels/i }));
    fireEvent.click(await screen.findByText('Email'));
    await act(() => new Promise((r) => setTimeout(r, 250)));

    // Still open, so a second option can be picked.
    expect(screen.getByText('Chat')).toBeInTheDocument();
  });

  it('hides the Pipeline stage property row entirely — stage has one home, the header picker', () => {
    mocks.properties = [prop({ id: 'p3', key: 'pipeline_stage', label: 'Pipeline stage', options: ['target', 'discovery_call'] })];
    mocks.value = 'discovery_call';
    renderPanel();

    expect(screen.queryByText('Pipeline stage')).not.toBeInTheDocument();
    expect(screen.queryByText('Meeting booked')).not.toBeInTheDocument();
    expect(screen.queryByText('Read-only')).not.toBeInTheDocument();
  });

  /**
   * One annual-revenue row only: the derived "Potential ARR". A second,
   * hand-typed ARR would drift from it, so there is none, and the derived one
   * stays read-only because MRR is the input.
   */
  it('shows one ARR row — the derived Potential ARR, read-only', () => {
    mocks.properties = [prop({ id: 'p4', key: 'arr', label: 'Potential ARR', type: 'currency', options: [] })];
    mocks.value = 120000;
    renderPanel();

    expect(screen.getByText('Potential ARR')).toBeInTheDocument();
    expect(screen.queryByText('Expected ARR')).not.toBeInTheDocument();
    // Read-only: no edit affordance on the row.
    expect(screen.queryByRole('button', { name: /potential arr/i })).not.toBeInTheDocument();
  });
});
