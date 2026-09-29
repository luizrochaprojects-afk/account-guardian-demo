import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AccountsTableView, { type AccountsTableViewProps } from './AccountsTableView';

function baseProps(overrides: Partial<AccountsTableViewProps> = {}): AccountsTableViewProps {
  return {
    rows: [],
    allRows: [],
    grouped: { '': [] },
    accountById: new Map(),
    customProps: [],
    visibleCustomProps: [],
    customValuesByAccount: {},
    tableDataColumns: [],
    healthTrends: {},
    viewMode: 'table',
    groupBy: 'none',
    isFilterUpdating: false,
    loading: false,
    isColVisible: () => false,
    currencySymbol: '$',
    formatCurrency: (n: number) => `$${n}`,
    selected: new Set(),
    allSelected: false,
    toggle: vi.fn(),
    toggleAll: vi.fn(),
    navigate: vi.fn() as any,
    prefetchAccount: vi.fn(),
    openCreate: vi.fn(),
    openEdit: vi.fn(),
    setDeleteId: vi.fn(),
    ...overrides,
  };
}

describe('AccountsTableView — loading vs empty', () => {
  it('does NOT show the "No accounts yet" empty state while loading', () => {
    render(<AccountsTableView {...baseProps({ loading: true, allRows: [], rows: [] })} />);
    expect(screen.queryByText('No accounts yet')).toBeNull();
  });

  it('shows the "No accounts yet" empty state once loaded with zero accounts', () => {
    render(<AccountsTableView {...baseProps({ loading: false, allRows: [], rows: [] })} />);
    expect(screen.getByText('No accounts yet')).toBeInTheDocument();
  });
});
