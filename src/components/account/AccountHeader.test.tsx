import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useSystemPropertyOptions', () => ({ useSystemPropertyOptions: () => ({ options: ['SMB', 'Mid-Market'] }) }));
vi.mock('@/hooks/useOrgSettings', () => ({ useOrgSettings: () => ({ currencySymbol: '$', currencyCode: 'USD' }) }));
vi.mock('@/hooks/useRole', () => ({ useRole: () => ({ isFounder: false }) }));
vi.mock('./LifecycleHistoryDialog', () => ({ LifecycleHistoryDialog: () => null }));
vi.mock('@/components/accounts/StageReasonModal', () => ({ StageReasonModal: () => null }));

const { AccountHeader } = await import('./AccountHeader');

const account = {
  id: 'a1', name: 'Bluebird Health', industry: 'Fintech', segment: 'Mid-Market',
  trend: 'flat', pipeline_stage: 'target', arr: 200000,
  stage_changed_at: new Date(Date.now() - 79 * 86400000).toISOString(),
  founder_confidence: null, createdAt: null,
} as any;

function renderHeader(props: Partial<Parameters<typeof AccountHeader>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AccountHeader account={account} healthScore={0} onLogInteraction={() => {}} onAddContact={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

describe('AccountHeader', () => {
  it('renders days in stage spelled out and primary actions', () => {
    renderHeader();
    expect(screen.getByText(/\d+ days in stage/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log interaction' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add contact' })).toBeInTheDocument();
    expect(screen.getByText('Target')).toBeInTheDocument();
  });
  it('never renders a bare em-dash outside HealthBadge', () => {
    const { container } = renderHeader({ account: { ...account, arr: 0 } });
    // the only "—" allowed is HealthBadge's noData badge
    const dashes = Array.from(container.querySelectorAll('*')).filter(el => el.childNodes.length === 1 && el.textContent === '—');
    expect(dashes.length).toBeLessThanOrEqual(1);
  });
});
