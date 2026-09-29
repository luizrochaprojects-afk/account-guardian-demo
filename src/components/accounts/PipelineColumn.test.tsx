import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineColumn } from './PipelineColumn';
import type { Account } from '@/contexts/AccountsContext';

// dnd-kit needs a minimal mock
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

// The card pulls org-wide hooks (signals, health) — stub it so the column
// renders in isolation.
vi.mock('./PipelineCard', () => ({
  PipelineCard: ({ account }: { account: Account }) => <div>{account.name}</div>,
}));

// The ARR subtotal formats through useMoney, which reads the org's currency
// from org settings. Stub only the settings, so the real formatter runs.
let orgCurrency = { currencyCode: 'USD', currencySymbol: '$' };
vi.mock('@/hooks/useOrgSettings', () => ({
  useOrgSettings: () => ({ ...orgCurrency, loading: false, updateCurrency: vi.fn() }),
}));

const makeAccount = (over: Partial<Account> = {}): Account =>
  ({ id: 'acc-1', name: 'Northwind Supply', pipeline_stage: 'target', ...over } as unknown as Account);

describe('PipelineColumn', () => {
  beforeEach(() => {
    orgCurrency = { currencyCode: 'USD', currencySymbol: '$' };
  });

  it('renders label in Title Case, not ALL CAPS', () => {
    render(<PipelineColumn stage="target" label="Target" accounts={[]} />);
    const el = screen.getByText('Target');
    expect(el.className).not.toContain('uppercase');
  });

  it('shows the potential-ARR subtotal when accounts carry arr', () => {
    render(
      <PipelineColumn
        stage="working"
        label="Working"
        accounts={[
          makeAccount({ id: 'a1', arr: 120000 }),
          makeAccount({ id: 'a2', name: 'Bluebird Health', arr: 80000 }),
        ]}
      />,
    );
    expect(screen.getByText('$200,000')).toBeInTheDocument();
  });

  it('formats the ARR subtotal in the org currency, not a hardcoded one', () => {
    orgCurrency = { currencyCode: 'EUR', currencySymbol: '€' };
    render(
      <PipelineColumn
        stage="working"
        label="Working"
        accounts={[makeAccount({ id: 'a1', arr: 45000 })]}
      />,
    );
    expect(screen.getByText('€45,000')).toBeInTheDocument();
  });

  it('hides the ARR subtotal when the stage sums to zero', () => {
    render(
      <PipelineColumn stage="target" label="Target" accounts={[makeAccount()]} />,
    );
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });

  it('shows 4-week usage instead of ARR on a customer column', () => {
    render(
      <PipelineColumn
        stage="steady"
        label="Steady"
        accounts={[makeAccount({ id: 'a1', pipeline_stage: 'steady', arr: 120000 })]}
        usageTotal={84_000}
      />,
    );
    expect(screen.getByText('84k usage / 4w')).toBeInTheDocument();
    // A live customer's potential ARR is a number from a negotiation that ended.
    expect(screen.queryByText('$120,000')).not.toBeInTheDocument();
  });

  it('hides the usage subtotal when the customer column used nothing', () => {
    render(
      <PipelineColumn
        stage="at_risk"
        label="At Risk"
        accounts={[makeAccount({ id: 'a1', pipeline_stage: 'at_risk', arr: 120000 })]}
        usageTotal={0}
      />,
    );
    expect(screen.queryByText(/usage \/ 4w/)).not.toBeInTheDocument();
    expect(screen.queryByText('$120,000')).not.toBeInTheDocument();
  });

  describe('quick add', () => {
    const quickAdd = (label: string) =>
      screen.queryByRole('button', { name: `Add account to ${label}` });

    it('is absent when no onQuickCreate is provided', () => {
      render(<PipelineColumn stage="target" label="Target" accounts={[]} />);
      expect(quickAdd('Target')).not.toBeInTheDocument();
    });

    it('is offered on an empty column, alongside the drag placeholder', () => {
      render(
        <PipelineColumn
          stage="discovery_call"
          label="Discovery Call"
          accounts={[]}
          onQuickCreate={vi.fn()}
        />,
      );
      expect(quickAdd('Discovery Call')).toBeInTheDocument();
      expect(screen.getByText('Drag an account here')).toBeInTheDocument();
    });

    it('is offered after the last card on a column that has accounts', () => {
      render(
        <PipelineColumn
          stage="discovery_call"
          label="Discovery Call"
          accounts={[makeAccount()]}
          onQuickCreate={vi.fn()}
        />,
      );
      expect(quickAdd('Discovery Call')).toBeInTheDocument();
      expect(screen.queryByText('Drag an account here')).not.toBeInTheDocument();
    });

    // The RPC demands a reason for these, and chk_loss_reason_required_when_lost
    // rejects a closed_lost insert outright.
    it.each([
      ['disqualified', 'Disqualified'],
      ['closed_lost', 'Closed Lost'],
      ['churned', 'Churned'],
    ])('is hidden on the reason-gated stage %s', (stage, label) => {
      render(
        <PipelineColumn stage={stage} label={label} accounts={[]} onQuickCreate={vi.fn()} />,
      );
      expect(quickAdd(label)).not.toBeInTheDocument();
    });

    it('replaces the placeholder with the composer once opened', () => {
      render(
        <PipelineColumn
          stage="discovery_call"
          label="Discovery Call"
          accounts={[]}
          onQuickCreate={vi.fn()}
        />,
      );

      fireEvent.click(quickAdd('Discovery Call')!);

      expect(screen.getByRole('textbox', { name: 'New account in Discovery Call' })).toBeInTheDocument();
      expect(screen.queryByText('Drag an account here')).not.toBeInTheDocument();
    });
  });
});
