import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomerPhaseHeader } from './CustomerPhaseHeader';
import {
  DEFAULT_CUSTOMER_THRESHOLDS,
  type CustomerSignals,
} from '@/lib/customerSignals';

let rows: CustomerSignals[] = [];
let loading = false;
const reclassify = vi.fn();
vi.mock('@/hooks/useCustomerSignals', () => ({
  useCustomerSignals: () => ({
    rows,
    byAccount: new Map(rows.map((r) => [r.accountId, r])),
    thresholds: DEFAULT_CUSTOMER_THRESHOLDS,
    loading,
    reclassify,
  }),
}));

let isFounder = true;
vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ isFounder, isMember: !isFounder, isLoading: false }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

const signals = (over: Partial<CustomerSignals> = {}): CustomerSignals => ({
  accountId: 'a',
  pipelineStage: 'steady',
  customerSince: null,
  firstUsageAt: '2025-01-01T00:00:00Z',
  lastUsageAt: '2026-07-27T00:00:00Z',
  reactivatedAt: null,
  customerStagePinnedAt: null,
  usage4w: 0,
  usagePrev4w: 0,
  usageDeltaPct: null,
  weeksSinceLastUsage: 0,
  daysSinceLastActivity: 1,
  healthScore: 80,
  healthLoggedAt: '2026-08-01T00:00:00Z',
  cohort: 'M1+',
  signalQuality: 'full',
  ...over,
});

/**
 * Read one metric by its label. NRR and GRR can legitimately render the same
 * string, so a bare getByText is ambiguous — scope to the tile.
 */
const metric = (label: string) =>
  screen.getByText(label).parentElement as HTMLElement;

describe('CustomerPhaseHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows = [];
    loading = false;
    isFounder = true;
  });

  it('shows numerator and denominator alongside the rate — a retention number without its denominator is unauditable', () => {
    rows = [
      signals({ accountId: 'a', usage4w: 84000, usagePrev4w: 79000 }),
    ];
    render(<CustomerPhaseHeader />);
    expect(metric('Net usage retention')).toHaveTextContent('84k / 79k = 106%');
  });

  it('caps GRR per account, so one account growing cannot hide another collapsing', () => {
    rows = [
      // +100% on one, -100% on the other. NRR nets to 100%; GRR must not.
      signals({ accountId: 'a', usage4w: 20000, usagePrev4w: 10000 }),
      signals({ accountId: 'b', usage4w: 0, usagePrev4w: 10000 }),
    ];
    render(<CustomerPhaseHeader />);
    // NRR nets the two out to flat...
    expect(metric('Net usage retention')).toHaveTextContent('20k / 20k = 100%');
    // ...GRR refuses to let the winner pay for the loser.
    expect(metric('Gross usage retention')).toHaveTextContent('10k / 20k = 50%');
  });

  it('excludes accounts with no prior window from the retention denominator', () => {
    rows = [
      signals({ accountId: 'a', usage4w: 10000, usagePrev4w: 10000 }),
      // Brand-new logo: used the product this window, nothing before. Counting
      // it would make retention climb every time sales closes a deal.
      signals({ accountId: 'b', usage4w: 50000, usagePrev4w: 0 }),
    ];
    render(<CustomerPhaseHeader />);
    // The new logo's 50k is nowhere in the fraction.
    expect(metric('Net usage retention')).toHaveTextContent('10k / 10k = 100%');
    expect(screen.getByText('1 account in the prior window')).toBeInTheDocument();
  });

  it('renders the usage total and its delta with an arrow and a sign, not colour alone', () => {
    rows = [
      signals({ accountId: 'a', usage4w: 13400, usagePrev4w: 10000 }),
    ];
    render(<CustomerPhaseHeader />);
    expect(metric('Usage 4w')).toHaveTextContent('13k');
    expect(screen.getByText('▲ +34% vs. prior 4w')).toBeInTheDocument();
  });

  it('marks a falling total with a down arrow, and a missing baseline with a dash', () => {
    rows = [signals({ accountId: 'a', usage4w: 7800, usagePrev4w: 10000 })];
    const { unmount } = render(<CustomerPhaseHeader />);
    expect(screen.getByText('▼ -22% vs. prior 4w')).toBeInTheDocument();
    unmount();

    rows = [signals({ accountId: 'a', usage4w: 500, usagePrev4w: 0 })];
    render(<CustomerPhaseHeader />);
    expect(screen.getByText('— vs. prior 4w')).toBeInTheDocument();
    expect(metric('Net usage retention')).toHaveTextContent('—');
  });

  it('says how many live accounts have no fresh data', () => {
    rows = [signals({ accountId: 'a' }), signals({ accountId: 'b', signalQuality: 'stale' })];
    render(<CustomerPhaseHeader />);
    expect(screen.getByText('1 without fresh data')).toBeInTheDocument();
  });

  it('counts only live customers as active — churned are excluded', () => {
    rows = [
      signals({ accountId: 'a' }),
      signals({ accountId: 'b' }),
      signals({ accountId: 'c', pipelineStage: 'churned' }),
    ];
    render(<CustomerPhaseHeader />);
    const active = screen.getByTitle(/churned excluded/i);
    expect(active).toHaveTextContent('2');
  });

  it('surfaces the dormant alert as a button that filters the board', () => {
    const onFilter = vi.fn();
    rows = [
      signals({ accountId: 'a', weeksSinceLastUsage: DEFAULT_CUSTOMER_THRESHOLDS.dormantWeeks }),
      signals({ accountId: 'b', weeksSinceLastUsage: 0 }),
    ];
    render(<CustomerPhaseHeader onFilterDormant={onFilter} />);
    const button = screen.getByRole('button', { name: /Dormant/ });
    expect(button).toHaveTextContent('1');
    expect(button).toHaveTextContent(`no usage for ${DEFAULT_CUSTOMER_THRESHOLDS.dormantWeeks}+ weeks`);
    fireEvent.click(button);
    expect(onFilter).toHaveBeenCalled();
  });

  it('hides the dormant alert when nobody has gone quiet', () => {
    rows = [signals({ accountId: 'a', weeksSinceLastUsage: DEFAULT_CUSTOMER_THRESHOLDS.dormantWeeks - 1 })];
    render(<CustomerPhaseHeader />);
    expect(screen.queryByText('Dormant')).not.toBeInTheDocument();
  });

  it('does not count a churned account as dormant', () => {
    rows = [signals({ accountId: 'gone', pipelineStage: 'churned', weeksSinceLastUsage: 20 })];
    render(<CustomerPhaseHeader />);
    expect(screen.queryByText('Dormant')).not.toBeInTheDocument();
  });

  it('offers Reclassify to founders only', () => {
    rows = [signals()];
    const { unmount } = render(<CustomerPhaseHeader />);
    expect(screen.getByRole('button', { name: /Reclassify/ })).toBeInTheDocument();
    unmount();

    isFounder = false;
    render(<CustomerPhaseHeader />);
    expect(screen.queryByRole('button', { name: /Reclassify/ })).not.toBeInTheDocument();
  });

  it('reports how many accounts actually moved, and says so plainly when none did', async () => {
    rows = [signals()];
    reclassify.mockResolvedValue({ moved: 0, error: null });
    render(<CustomerPhaseHeader />);
    fireEvent.click(screen.getByRole('button', { name: /Reclassify/ }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/Nothing to reclassify/)),
    );
  });

  it('says nothing rather than showing zeroes when there are no signals yet', () => {
    rows = [];
    render(<CustomerPhaseHeader />);
    expect(screen.getByText('No usage signals yet')).toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });
});
