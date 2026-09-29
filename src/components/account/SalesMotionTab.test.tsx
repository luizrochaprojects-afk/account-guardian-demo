import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

const role = vi.hoisted(() => ({ isFounder: true }));
const updateAccount = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useDiscoveryNotes', () => ({ useDiscoveryNotes: () => ({ notes: [] }) }));
vi.mock('@/hooks/useRole', () => ({ useRole: () => ({ isFounder: role.isFounder }) }));
vi.mock('@/hooks/useContactsDB', () => ({ useContactsDB: () => ({ contacts: [] }) }));
vi.mock('@/contexts/AccountsContext', async (orig) => ({
  ...(await orig() as any),
  useAccounts: () => ({ updateAccount }),
}));
vi.mock('./DealCoverageSection', () => ({ DealCoverageSection: () => <div>deal-coverage</div> }));
// The modal keeps its own "Grant Qualified Opp." button; here it only has to
// report whether the tab opened it.
vi.mock('./SalApprovalModal', () => ({
  SalApprovalModal: ({ open }: { open: boolean }) => (open ? <div>sal-modal-open</div> : null),
}));

const { SalesMotionTab } = await import('./SalesMotionTab');

const baseAccount = {
  id: 'a1', name: 'Northwind Supply', pipeline_stage: 'discovery_call', founder_confidence: null,
  stage_changed_at: null, revenue_owner_id: null, delivery_owner_id: null, expected_close_date: null,
  arr: 150000, risk_notes: null, qualification_checklist: null,
  incumbent_vendor: null, incumbent_last_renewal: null, incumbent_cycle: 'unknown',
  incumbent_evidence: null,
} as any;

function renderTab(over: Record<string, unknown> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SalesMotionTab account={{ ...baseAccount, ...over }} />
    </QueryClientProvider>,
  );
}

describe('SalesMotionTab', () => {
  beforeEach(() => {
    role.isFounder = true;
    updateAccount.mockReset();
  });

  it('does not duplicate Stage, Expected close, Expected ARR or Owner — those live in the sidebar now', () => {
    renderTab();
    expect(screen.queryByText('Stage')).toBeNull();
    expect(screen.queryByText('Expected close')).toBeNull();
    expect(screen.queryByText('Expected ARR')).toBeNull();
    expect(screen.queryByText('Owner')).toBeNull();
  });

  // Removed 2026-08-25. The row read "Not set" on every account anyone was
  // working, so it was noise on the page. accounts.risk_notes still exists —
  // this asserts the UI is gone, not the column.
  it('no longer shows the Risks row', () => {
    renderTab();
    expect(screen.queryByText('Risks')).toBeNull();
  });

  it('offers the founder "Review & qualify" on a deal in discovery, which opens the approval modal', () => {
    renderTab();
    expect(screen.queryByText('sal-modal-open')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review & qualify' }));
    expect(screen.getByText('sal-modal-open')).toBeInTheDocument();
  });

  it('hides the approval action from non-founders', () => {
    role.isFounder = false;
    renderTab();
    expect(screen.queryByRole('button', { name: 'Review & qualify' })).toBeNull();
  });

  it('hides the approval action once the deal is past discovery', () => {
    renderTab({ pipeline_stage: 'business_case' });
    expect(screen.queryByRole('button', { name: 'Review & qualify' })).toBeNull();
  });

  it('shows the qualification checklist with its answered count', () => {
    renderTab({
      qualification_checklist: { is_decision_maker: { answer: true }, timeline: { answer: false } },
    });
    expect(screen.getByRole('heading', { name: 'Qualification' })).toBeInTheDocument();
    expect(screen.getByText('2/6 answered')).toBeInTheDocument();
  });

  it('lets anyone answer a checklist item in place, saved as a human answer', () => {
    role.isFounder = false;
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /^Internal champion identified: unanswered\./ }));
    expect(updateAccount).toHaveBeenCalledWith('a1', {
      qualification_checklist: { champion: { answer: true, source: 'human' } },
    });
  });

  it('renders deal coverage and incumbent sections', () => {
    renderTab();
    expect(screen.getByText('deal-coverage')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Incumbent' })).toBeInTheDocument();
  });

  it('shows discovery notes empty state', () => {
    renderTab();
    expect(screen.getByText('No discoveries logged yet.')).toBeInTheDocument();
  });
});
