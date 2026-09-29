import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AccountSetupChecklist, buildSetupItems } from './AccountSetupChecklist';

const noop = () => {};
const base = { openLogInteraction: noop, openAddContact: noop, openSalesSetup: noop };
// Accounts carry two owners; only the revenue owner
// gates setup completeness (delivery is nullable by design).
const emptyAccount = { revenue_owner_id: null, delivery_owner_id: null, expected_close_date: null } as any;

describe('buildSetupItems', () => {
  it('all 4 incomplete for an empty account', () => {
    const items = buildSetupItems({ account: emptyAccount, contactCount: 0, eventCount: 0, ...base });
    expect(items).toHaveLength(4);
    expect(items.every(i => !i.done)).toBe(true);
  });
  it('counts done items', () => {
    const items = buildSetupItems({
      account: { revenue_owner_id: 'u1', delivery_owner_id: null, expected_close_date: '2026-08-01' } as any,
      contactCount: 2, eventCount: 0, ...base,
    });
    expect(items.filter(i => i.done)).toHaveLength(3);
  });
});

describe('AccountSetupChecklist', () => {
  it('renders progress summary and only incomplete actions', () => {
    const items = buildSetupItems({ account: emptyAccount, contactCount: 5, eventCount: 0, ...base });
    render(<AccountSetupChecklist items={items} />);
    expect(screen.getByText('Account setup — 1 of 4 done')).toBeInTheDocument();
    expect(screen.queryByText('Add contact')).toBeNull(); // done items hidden
    expect(screen.getByText('Assign owner')).toBeInTheDocument();
  });
  it('renders nothing when all complete', () => {
    const items = buildSetupItems({
      account: { revenue_owner_id: 'u1', delivery_owner_id: null, expected_close_date: '2026-08-01' } as any,
      contactCount: 1, eventCount: 1, ...base,
    });
    const { container } = render(<AccountSetupChecklist items={items} />);
    expect(container.firstChild).toBeNull();
  });
});
