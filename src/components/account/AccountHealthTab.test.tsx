import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockLogs = vi.fn();
vi.mock('@/hooks/useHealthLogs', () => ({
  useHealthLogs: () => ({ logs: mockLogs(), loading: false, refetch: vi.fn() }),
}));
// The tab resolves the profile from the account's stage; `null` means no
// profile claims that stage, which is a distinct state from "no metrics".
const mockProfile = vi.fn();
vi.mock('@/contexts/HealthConfigContext', () => ({
  useAccountHealthProfile: () => mockProfile(),
}));
const mockMetrics = (metrics: unknown[]) => mockProfile.mockReturnValue({ id: 'p1', metrics });
vi.mock('@/demo/db', () => ({
  db: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
    rpc: vi.fn(),
  },
}));

const { AccountHealthTab } = await import('./AccountHealthTab');
const { MemoryRouter } = await import('react-router-dom');

const renderTab = (stage: string | null = 'steady') => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AccountHealthTab accountId="a1" trend="flat" stage={stage} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('AccountHealthTab', () => {
  it('unmapped stage: not scored, and never reported as at risk', () => {
    // A pre-sale account has no profile. Before this state existed it fell
    // through to the default profile and got a real-looking score.
    mockProfile.mockReturnValue(null);
    mockLogs.mockReturnValue([]);
    renderTab('target');
    expect(screen.getByText('Not scored at this stage')).toBeInTheDocument();
    expect(screen.queryByText(/at risk/i)).toBeNull();
    expect(screen.queryByText('Health score not configured')).toBeNull();
  });

  it('not configured: shows configure CTA, no chart, no Concerning', () => {
    mockMetrics([]);
    mockLogs.mockReturnValue([]);
    renderTab();
    expect(screen.getByText('Health score not configured')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /configure health score/i })).toHaveAttribute('href', '/health-config');
    expect(screen.queryByText(/concerning/i)).toBeNull();
  });

  it('metrics but no logs: No data state, never Concerning or 0/', () => {
    mockMetrics([{ id: 'm1', name: 'NPS', weight: 20 }]);
    mockLogs.mockReturnValue([]);
    renderTab();
    expect(screen.getByText(/no health data yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/concerning/i)).toBeNull();
    expect(screen.queryByText(/0\/20/)).toBeNull();
  });

  it('single log: no trend chart yet', () => {
    mockMetrics([{ id: 'm1', name: 'NPS', weight: 20 }]);
    mockLogs.mockReturnValue([
      {
        id: 'l1',
        total_score: 55,
        logged_at: '2026-07-01',
        scores: {},
        observation: null,
        metrics_snapshot: [],
        profile_name: null,
      },
    ]);
    renderTab();
    expect(screen.getByText(/appears after the second update/i)).toBeInTheDocument();
  });
});
