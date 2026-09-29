import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/demo/db';
import { fetchAccountsList, accountsListQueryKey } from './AccountsContext';

vi.mock('@/demo/db', () => ({
  db: { from: vi.fn() },
}));

// Final builder call (`.order(...)`) is awaited, so it must be thenable.
function thenable(result: any) {
  return { then: (cb: any) => cb(result) };
}

describe('fetchAccountsList — single source of truth for ["accounts", orgId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the { rows, stageChangedAt } object shape, never a bare array', async () => {
    // Regression guard for the blank-accounts bug: AppSidebar.prefetchForRoute
    // used to populate ["accounts", orgId] with a plain DbAccount[] array while
    // AccountsContext reads `.rows`. On hover-prefetch the array clobbered the
    // cache → `queryData?.rows` was undefined → the list rendered "No accounts
    // yet" in every view until a hard reload. Both call sites now go through
    // this fetcher, so the cache entry can never diverge in shape again.
    const accountRows = [
      { id: 'a1', name: 'Acme' },
      { id: 'a2', name: 'Globex' },
    ];
    (db.from as any).mockImplementation((table: string) => {
      if (table === 'accounts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue(thenable({ data: accountRows, error: null })),
        };
      }
      // events
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnValue(
          thenable({ data: [{ account_id: 'a1', created_at: '2026-01-01' }], error: null }),
        ),
      };
    });

    const result = await fetchAccountsList('org-1');

    expect(Array.isArray(result)).toBe(false);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].id).toBe('a1');
    expect(result.stageChangedAt.get('a1')).toBe('2026-01-01');
  });

  it('keys the query on orgId', () => {
    expect([...accountsListQueryKey('org-1')]).toEqual(['accounts', 'org-1']);
  });
});
