import { describe, it, expect } from 'vitest';
import {
  applyAccountFilters,
  applyFiltersToSearchParams,
  parseFiltersFromSearchParams,
  matchesOwnerFilters,
  normalizeSavedFilters,
  hasActiveFilters,
  type AccountFilters,
} from './viewFilters';
import type { Account } from '@/contexts/AccountsContext';

/**
 * The account owner filters: one for the revenue owner, one for the delivery
 * owner.
 *
 * These live here rather than in a page test because three call sites share the
 * predicate — the AllAccounts table memo, the pipeline-board memo, and
 * `applyAccountFilters` (export + the Views index counts). Pinning it once is
 * what keeps them from drifting.
 */

function account(over: Partial<Account>): Account {
  return {
    id: 'a1', name: 'Acme', segment: 'SMB', healthScore: 80, lifecycleStage: 'target',
    revenue_owner_id: null, delivery_owner_id: null,
    ...over,
  } as unknown as Account;
}

const ME = 'me-uuid';
const OTHER = 'other-uuid';

describe('matchesOwnerFilters', () => {
  it('passes everything when no owner filter is set', () => {
    expect(matchesOwnerFilters(account({}), {})).toBe(true);
    expect(matchesOwnerFilters(account({ revenue_owner_id: ME }), {})).toBe(true);
  });

  it('matches a selected revenue owner and rejects the rest', () => {
    const f = { revenueOwner: [ME] };
    expect(matchesOwnerFilters(account({ revenue_owner_id: ME }), f)).toBe(true);
    expect(matchesOwnerFilters(account({ revenue_owner_id: OTHER }), f)).toBe(false);
    expect(matchesOwnerFilters(account({ revenue_owner_id: null }), f)).toBe(false);
  });

  it("treats '__unassigned' as the null owner", () => {
    const f = { deliveryOwner: ['__unassigned'] };
    expect(matchesOwnerFilters(account({ delivery_owner_id: null }), f)).toBe(true);
    expect(matchesOwnerFilters(account({ delivery_owner_id: ME }), f)).toBe(false);
  });

  it('ANDs the two roles together', () => {
    const f = { revenueOwner: [ME], deliveryOwner: [OTHER] };
    expect(matchesOwnerFilters(account({ revenue_owner_id: ME, delivery_owner_id: OTHER }), f)).toBe(true);
    expect(matchesOwnerFilters(account({ revenue_owner_id: ME, delivery_owner_id: ME }), f)).toBe(false);
  });

  it('myAccounts matches either side, not both', () => {
    const f = { myAccounts: true };
    expect(matchesOwnerFilters(account({ revenue_owner_id: ME }), f, ME)).toBe(true);
    expect(matchesOwnerFilters(account({ delivery_owner_id: ME }), f, ME)).toBe(true);
    expect(matchesOwnerFilters(account({ revenue_owner_id: OTHER, delivery_owner_id: OTHER }), f, ME)).toBe(false);
  });

  it('myAccounts is a no-op without a current user', () => {
    // An export fired before the profile resolves must not silently return zero
    // rows — it would read as "the export is broken", not "you are logged out".
    const f = { myAccounts: true };
    expect(matchesOwnerFilters(account({ revenue_owner_id: OTHER }), f, null)).toBe(true);
    expect(matchesOwnerFilters(account({ revenue_owner_id: OTHER }), f, undefined)).toBe(true);
  });
});

describe('applyAccountFilters', () => {
  const accounts = [
    account({ id: 'mine-rev', revenue_owner_id: ME }),
    account({ id: 'mine-del', delivery_owner_id: ME }),
    account({ id: 'theirs', revenue_owner_id: OTHER, delivery_owner_id: OTHER }),
    account({ id: 'nobody' }),
  ];

  it('filters by revenue owner', () => {
    const out = applyAccountFilters(accounts, { revenueOwner: [OTHER] });
    expect(out.map(a => a.id)).toEqual(['theirs']);
  });

  it('filters by unassigned delivery owner', () => {
    const out = applyAccountFilters(accounts, { deliveryOwner: ['__unassigned'] });
    expect(out.map(a => a.id)).toEqual(['mine-rev', 'nobody']);
  });

  it('filters to my accounts on either side', () => {
    const out = applyAccountFilters(accounts, { myAccounts: true }, ME);
    expect(out.map(a => a.id)).toEqual(['mine-rev', 'mine-del']);
  });
});

describe('owner filters survive the URL round-trip', () => {
  it('writes and reads rown / down / mine', () => {
    const filters: AccountFilters = {
      revenueOwner: [ME, '__unassigned'],
      deliveryOwner: [OTHER],
      myAccounts: true,
    };
    // The strip pass inside applyFiltersToSearchParams deletes every known
    // filter key before rewriting; a key missing from that list survives one
    // sync and vanishes on the next.
    const sp = applyFiltersToSearchParams('accounts', new URLSearchParams(), filters);
    expect(sp.get('rown')).toBe(`${ME},__unassigned`);
    expect(sp.get('down')).toBe(OTHER);
    expect(sp.get('mine')).toBe('1');

    const back = parseFiltersFromSearchParams('accounts', sp) as AccountFilters;
    expect(back.revenueOwner).toEqual([ME, '__unassigned']);
    expect(back.deliveryOwner).toEqual([OTHER]);
    expect(back.myAccounts).toBe(true);

    // Re-syncing an already-synced URL must be stable, not lossy.
    const again = applyFiltersToSearchParams('accounts', sp, back);
    expect(again.get('rown')).toBe(`${ME},__unassigned`);
    expect(again.get('down')).toBe(OTHER);
    expect(again.get('mine')).toBe('1');
  });

  it('drops the params when the filters are cleared', () => {
    const sp = applyFiltersToSearchParams('accounts', new URLSearchParams('rown=x&down=y&mine=1'), {
      revenueOwner: [], deliveryOwner: [], myAccounts: false,
    });
    expect(sp.has('rown')).toBe(false);
    expect(sp.has('down')).toBe(false);
    expect(sp.has('mine')).toBe(false);
  });
});

describe('saved views predating the split', () => {
  it('normalizes the missing owner keys to empty arrays', () => {
    // AllAccounts feeds these straight into `new Set(...)`; an undefined here
    // throws and white-screens the view page.
    const f = normalizeSavedFilters('accounts', { health: [], segment: [] }) as AccountFilters;
    expect(f.revenueOwner).toEqual([]);
    expect(f.deliveryOwner).toEqual([]);
    expect(f.myAccounts).toBe(false);
    expect(hasActiveFilters('accounts', f)).toBe(false);
  });

  it('counts the owner filters as active', () => {
    expect(hasActiveFilters('accounts', { revenueOwner: [ME] })).toBe(true);
    expect(hasActiveFilters('accounts', { deliveryOwner: ['__unassigned'] })).toBe(true);
    expect(hasActiveFilters('accounts', { myAccounts: true })).toBe(true);
  });
});
