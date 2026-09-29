import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PipelineCard } from './PipelineCard';
import { PipelineCardFieldsProvider } from './PipelineCardFieldsContext';
import type { PipelinePhase } from '@/lib/transitionStage';
import type { Account } from '@/contexts/AccountsContext';
import {
  DEFAULT_CUSTOMER_THRESHOLDS,
  type CustomerSignals,
} from '@/lib/customerSignals';

vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
}));
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: () => undefined } },
}));

const trends: Record<string, { latest: number; previous: number | null }> = {};
// Org currency comes from settings; the card formats through useMoney.
vi.mock('@/hooks/useOrgSettings', () => ({
  useOrgSettings: () => ({ currencyCode: 'USD', currencySymbol: '$' }),
}));

vi.mock('@/hooks/useHealthTrends', () => ({
  useHealthTrends: () => ({ trends, loading: false }),
}));

// The Customer variant reads the signals view through this hook. Mutable map so
// each test can hand the card exactly the signal row it is about.
const signalsByAccount = new Map<string, CustomerSignals>();
vi.mock('@/hooks/useCustomerSignals', () => ({
  useCustomerSignals: () => ({
    rows: [...signalsByAccount.values()],
    byAccount: signalsByAccount,
    thresholds: DEFAULT_CUSTOMER_THRESHOLDS,
    loading: false,
    reclassify: vi.fn(),
  }),
}));

// QuickAddActivity needs auth/query providers; the card only cares about its trigger.
vi.mock('@/components/activities/QuickAddActivity', () => ({
  QuickAddActivity: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

const makeAccount = (over: Partial<Account> = {}): Account =>
  ({
    id: 'acc-1',
    name: 'Northwind Supply',
    pipeline_stage: 'working',
    revenue_owner_id: null,
    delivery_owner_id: null,
    segment: '',
    industry: '',
    ...over,
  } as unknown as Account);

/** A live, unremarkable customer: using the product steadily, nothing to flag. */
const makeSignals = (over: Partial<CustomerSignals> = {}): CustomerSignals => ({
  accountId: 'acc-1',
  pipelineStage: 'steady',
  customerSince: '2025-01-01',
  firstUsageAt: '2025-01-15T00:00:00Z',
  lastUsageAt: new Date().toISOString(),
  reactivatedAt: null,
  customerStagePinnedAt: null,
  usage4w: 4000,
  usagePrev4w: 4000,
  usageDeltaPct: 0,
  weeksSinceLastUsage: 0,
  daysSinceLastActivity: 3,
  healthScore: 80,
  healthLoggedAt: '2026-08-01T00:00:00Z',
  cohort: 'M1+',
  signalQuality: 'full',
  ...over,
});

/** The card badges against the real clock, so relative dates keep the test stable. */
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const renderCard = (account: Account) =>
  render(
    <MemoryRouter>
      <PipelineCard account={account} />
    </MemoryRouter>,
  );

describe('PipelineCard', () => {
  beforeEach(() => {
    for (const k of Object.keys(trends)) delete trends[k];
    signalsByAccount.clear();
  });

  it('shows the health score with an accessible status label when a log exists', () => {
    trends['acc-1'] = { latest: 72, previous: null };
    renderCard(makeAccount());
    const chip = screen.getByLabelText('Health Healthy (72)');
    expect(chip).toHaveTextContent('72');
  });

  it('renders no health chip when the account has no health log', () => {
    renderCard(makeAccount());
    expect(screen.queryByLabelText(/^Health /)).not.toBeInTheDocument();
  });

  it('shows the segment · industry context line when present', () => {
    renderCard(makeAccount({ segment: 'Enterprise', industry: 'Retail' }));
    expect(screen.getByText('Enterprise · Retail')).toBeInTheDocument();
  });

  it('shows the last-contact date on the dates line', () => {
    renderCard(makeAccount({ lastContact: '2026-07-05T12:00:00Z' }));
    expect(screen.getByText(/Last /)).toBeInTheDocument();
  });

  it('keeps the Log quick-add reachable (hover/focus reveal is CSS-only)', () => {
    renderCard(makeAccount());
    expect(screen.getByRole('button', { name: /Log/ })).toBeInTheDocument();
  });
});

describe('PipelineCard — Customer variant', () => {
  const customerAccount = (over: Partial<Account> = {}): Account =>
    makeAccount({
      pipeline_phase: 'customer',
      pipeline_stage: 'steady',
      ...over,
    });

  beforeEach(() => {
    for (const k of Object.keys(trends)) delete trends[k];
    signalsByAccount.clear();
  });

  it('hides the pre-close metrics — potential ARR and founder confidence say nothing about a live account', () => {
    signalsByAccount.set('acc-1', makeSignals());
    renderCard(
      customerAccount({ arr: 250000, founder_confidence: 'high' }),
    );
    expect(screen.queryByText(/250,000/)).not.toBeInTheDocument();
    expect(screen.queryByText('HIGH')).not.toBeInTheDocument();
  });

  it('still shows potential ARR outside the Customer phase', () => {
    renderCard(
      makeAccount({ arr: 250000, founder_confidence: 'high' }),
    );
    expect(screen.getByText(/250,000/)).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('renders 4-week usage and a signed, arrowed delta', () => {
    signalsByAccount.set(
      'acc-1',
      makeSignals({ usage4w: 12_400, usageDeltaPct: 0.34 }),
    );
    renderCard(customerAccount());
    expect(screen.getByText('12k usage / 4w')).toBeInTheDocument();
    // Arrow AND sign AND number — status is never colour alone (WCAG).
    expect(screen.getByText('▲ +34%')).toBeInTheDocument();
  });

  it('renders a falling delta with a down arrow and a negative number', () => {
    signalsByAccount.set('acc-1', makeSignals({ usageDeltaPct: -0.22 }));
    renderCard(customerAccount());
    expect(screen.getByText('▼ -22%')).toBeInTheDocument();
  });

  it('renders em-dash, never 0%, when there is no baseline to compare against', () => {
    signalsByAccount.set(
      'acc-1',
      makeSignals({ usageDeltaPct: null, usagePrev4w: 0 }),
    );
    renderCard(customerAccount());
    expect(screen.getByTitle(/last 4 weeks vs/i)).toHaveTextContent('—');
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  it('renders a flat month as 0% with no arrow — a real zero, not a missing one', () => {
    signalsByAccount.set('acc-1', makeSignals({ usageDeltaPct: 0 }));
    renderCard(customerAccount());
    expect(screen.getByTitle(/last 4 weeks vs/i)).toHaveTextContent(/^0%$/);
  });

  it('renders an em-dash rather than "0 usage" for an account with no usage in the window', () => {
    signalsByAccount.set('acc-1', makeSignals({ usage4w: 0 }));
    renderCard(customerAccount());
    expect(screen.getByTitle('Product usage, last 4 weeks')).toHaveTextContent('—');
    expect(screen.queryByText(/usage \/ 4w/)).not.toBeInTheDocument();
  });

  it('carries no money metrics on a customer card', () => {
    signalsByAccount.set('acc-1', makeSignals());
    renderCard(customerAccount());
    expect(screen.queryByText(/\/wk/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
  });

  it('spells the risk out in words on an At Risk card — a risk with no reason is noise', () => {
    signalsByAccount.set('acc-1', makeSignals({ pipelineStage: 'at_risk' }));
    renderCard(
      customerAccount({
        pipeline_stage: 'at_risk',
        customer_risk_reason: 'no_usage',
      }),
    );
    expect(screen.getByText('No usage for 2+ weeks')).toBeInTheDocument();
  });

  it('does not show a risk reason on a card that is not At Risk', () => {
    signalsByAccount.set('acc-1', makeSignals());
    renderCard(
      customerAccount({
        customer_risk_reason: 'no_usage',
      }),
    );
    expect(screen.queryByText('No usage for 2+ weeks')).not.toBeInTheDocument();
  });

  it('caps the badge row at 3 and collapses the rest into +N', () => {
    // Dormant + Contracting + Reactivated + M0 = 4 badges.
    signalsByAccount.set(
      'acc-1',
      makeSignals({
        cohort: 'M0',
        weeksSinceLastUsage: 6,
        usageDeltaPct: -0.5,
        reactivatedAt: daysAgo(20),
      }),
    );
    renderCard(customerAccount());
    expect(screen.getByText('Dormant')).toBeInTheDocument();
    expect(screen.getByText('Contracting')).toBeInTheDocument();
    expect(screen.getByText('Reactivated')).toBeInTheDocument();
    // The fourth collapses, and the overflow chip names it on hover.
    expect(screen.queryByText('M0')).not.toBeInTheDocument();
    expect(screen.getByText('+1')).toHaveAttribute('title', 'M0');
  });

  it('says so on the card when the usage data cannot be trusted', () => {
    signalsByAccount.set('acc-1', makeSignals({ signalQuality: 'stale' }));
    renderCard(customerAccount());
    expect(screen.getByText('Usage data stale')).toBeInTheDocument();
  });

  it('renders nothing customer-shaped when the signals row is missing (view empty or stale)', () => {
    renderCard(customerAccount({ arr: 250000 }));
    expect(screen.queryByText(/usage \/ 4w/)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/last 4 weeks vs/i)).not.toBeInTheDocument();
    // and it must not fall back to the Sales numbers either
    expect(screen.queryByText(/250,000/)).not.toBeInTheDocument();
  });
});

/**
 * Every test above renders the card WITHOUT a provider on purpose — that path
 * falls back to the registry defaults, so those tests double as the proof that
 * making the card configurable did not change what it shows by default.
 *
 * These go through the real provider, seeding localStorage the way the menu
 * would, so the persistence key format is covered too.
 */
describe('PipelineCard — configurable fields', () => {
  const renderWithFields = (
    account: Account,
    phase: PipelinePhase,
    visible: string[],
  ) => {
    window.localStorage.setItem(
      `pipeline.cardFields.${phase}:org-1:visibleColumns`,
      JSON.stringify(visible),
    );
    return render(
      <MemoryRouter>
        <PipelineCardFieldsProvider phase={phase} orgId="org-1">
          <PipelineCard account={account} />
        </PipelineCardFieldsProvider>
      </MemoryRouter>,
    );
  };

  beforeEach(() => {
    for (const k of Object.keys(trends)) delete trends[k];
    signalsByAccount.clear();
    window.localStorage.clear();
  });

  it('drops a field the user switched off', () => {
    renderWithFields(
      makeAccount({ stage_changed_at: '2026-08-01T00:00:00Z' }),
      'sdr',
      ['name', 'health'],
    );
    expect(screen.queryByText(/in stage$/)).not.toBeInTheDocument();
  });

  it('keeps the name even when the stored set is empty — it is required', () => {
    renderWithFields(makeAccount(), 'sdr', []);
    expect(screen.getByText('Northwind Supply')).toBeInTheDocument();
  });

  it('shows a field that is off by default once it is switched on', () => {
    renderWithFields(
      makeAccount({ tags: ['Founder-led', 'Beta'] }),
      'sdr',
      ['name', 'tags'],
    );
    expect(screen.getByText('Founder-led')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('caps the tag row at 3 and collapses the rest into +N', () => {
    renderWithFields(
      makeAccount({ tags: ['a', 'b', 'c', 'd', 'e'] }),
      'sdr',
      ['name', 'tags'],
    );
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.queryByText('d')).not.toBeInTheDocument();
  });

  it('joins only the visible parts of the attribute line, leaving no dangling separator', () => {
    renderWithFields(
      makeAccount({ segment: 'Enterprise', industry: 'Retail', plan: 'Pro' }),
      'sdr',
      ['name', 'segment', 'plan'],
    );
    expect(screen.getByText('Enterprise · Pro')).toBeInTheDocument();
  });

  it('ignores a stored field that means nothing in the current phase', () => {
    // 'usage' is Customer-only. Asking for it on an SDR card must not render
    // anything — the phase scoping in the registry is what stops it.
    signalsByAccount.set('acc-1', makeSignals());
    renderWithFields(makeAccount(), 'sdr', ['name', 'usage']);
    expect(screen.queryByText(/usage \/ 4w/)).not.toBeInTheDocument();
  });

  it('hides a Customer signal the user switched off without touching the others', () => {
    signalsByAccount.set('acc-1', makeSignals());
    renderWithFields(
      makeAccount({ pipeline_phase: 'customer', pipeline_stage: 'steady' }),
      'customer',
      ['name', 'usage'],
    );
    expect(screen.getByText('4k usage / 4w')).toBeInTheDocument();
    expect(screen.queryByTitle(/last 4 weeks vs/i)).not.toBeInTheDocument();
  });

  it('can show the delta alone, without the usage total', () => {
    signalsByAccount.set('acc-1', makeSignals({ usageDeltaPct: 0.3 }));
    renderWithFields(
      makeAccount({ pipeline_phase: 'customer', pipeline_stage: 'steady' }),
      'customer',
      ['name', 'usageDelta'],
    );
    expect(screen.getByText('▲ +30%')).toBeInTheDocument();
    expect(screen.queryByText(/usage \/ 4w/)).not.toBeInTheDocument();
  });
});
