import { describe, it, expect } from 'vitest';

import { orgQueryLoading } from './useOrgContext';

/**
 * The regression this helper exists to prevent.
 *
 * Every org-scoped hook runs `enabled: !!orgId`, and `orgId` arrives from an
 * async profile fetch. React Query v5 reports `isLoading === false` for a
 * DISABLED query, and each hook defaults its data to `[]` or zeros — so
 * between mount and the profile resolving, a surface read "not loading, no
 * data" and confidently rendered an empty list or a `0`. Seconds later the
 * real numbers replaced it. That flash is what these cases pin down.
 */
describe('orgQueryLoading', () => {
  const ctx = (over: Partial<Parameters<typeof orgQueryLoading>[0]> = {}) => ({
    orgId: 'org-1',
    profileLoading: false,
    profileError: null,
    ...over,
  });

  it('is loading while the profile is still in flight', () => {
    expect(
      orgQueryLoading(ctx({ orgId: null, profileLoading: true }), { isLoading: false }),
    ).toBe(true);
  });

  it('is loading in the gap after the profile resolves and before the query starts', () => {
    // The exact tick the bug lived in: profile done, orgId not yet threaded
    // through, query still disabled and therefore reporting isLoading false.
    expect(
      orgQueryLoading(ctx({ orgId: null, profileLoading: false }), { isLoading: false }),
    ).toBe(true);
  });

  it('is loading while the enabled query runs', () => {
    expect(orgQueryLoading(ctx(), { isLoading: true })).toBe(true);
  });

  it('is not loading once the query has answered', () => {
    expect(orgQueryLoading(ctx(), { isLoading: false })).toBe(false);
  });

  it('does not spin forever for a profile that genuinely has no organization', () => {
    // Otherwise this account would sit on a skeleton with nothing to wait for.
    expect(
      orgQueryLoading(
        ctx({ orgId: null, profileError: new Error('no org') }),
        { isLoading: false },
      ),
    ).toBe(false);
  });
});
