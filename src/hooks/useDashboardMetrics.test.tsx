import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useNorthStarCounts,
  useLossReasons,
  useTopObjections,
} from './useDashboardMetrics';
import { db } from '@/demo/db';

vi.mock('@/demo/db', () => ({
  db: {
    rpc: vi.fn(),
  },
}));

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: { id: 'p1', user_id: 'u1', display_name: null, avatar_url: null, organization_id: 'org-123' },
    loading: false,
    updateProfile: vi.fn(),
    refetch: vi.fn(),
  }),
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function mockRpcByName(map: Record<string, { data: any; error: any }>) {
  (db.rpc as any).mockImplementation((name: string) => {
    const result = map[name] ?? { data: [], error: null };
    return Promise.resolve(result);
  });
}

describe('useDashboardMetrics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('useNorthStarCounts returns the wrapped row when RPC succeeds', async () => {
    mockRpcByName({
      dashboard_north_star_counts: {
        data: [
          {
            accounts_worked: 42,
            working_count: 7,
            discovery_call_count: 5,
            qualified_opp_count: 3,
            signoff_count: 2,
            active_customer_count: 4,
          },
        ],
        error: null,
      },
    });

    const { result } = renderHook(() => useNorthStarCounts(new Date('2026-05-01')), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.accounts_worked).toBe(42);
    expect(result.current.data?.working_count).toBe(7);
    expect(result.current.data?.active_customer_count).toBe(4);
    expect(result.current.error).toBeNull();
  });

  it('useLossReasons returns the wrapped array', async () => {
    mockRpcByName({
      dashboard_loss_reasons: {
        data: [
          { loss_reason_category: 'no_budget', lost_from_stage: 'business_case', account_count: 6 },
          { loss_reason_category: 'bad_timing', lost_from_stage: 'discovery_call', account_count: 3 },
        ],
        error: null,
      },
    });

    const { result } = renderHook(() => useLossReasons(new Date('2026-05-01')), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(result.current.data[0].loss_reason_category).toBe('no_budget');
    expect(result.current.data[0].account_count).toBe(6);
  });

  it('useTopObjections returns the wrapped array', async () => {
    mockRpcByName({
      dashboard_objections: {
        data: [
          { objection: 'too expensive', occurrence_count: 11 },
          { objection: 'no budget', occurrence_count: 7 },
        ],
        error: null,
      },
    });

    const { result } = renderHook(() => useTopObjections(new Date('2026-05-01')), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(result.current.data[0].objection).toBe('too expensive');
    expect(result.current.data[0].occurrence_count).toBe(11);
  });

  it('surfaces RPC errors', async () => {
    mockRpcByName({
      dashboard_north_star_counts: { data: null, error: new Error('boom') },
    });

    const { result } = renderHook(() => useNorthStarCounts(new Date('2026-05-01')), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.data).toBeUndefined();
    expect(result.current.error?.message).toBe('boom');
  });

  it('different `since` values produce different queries (re-fetch)', async () => {
    mockRpcByName({
      dashboard_north_star_counts: {
        data: [
          {
            accounts_worked: 1,
            working_count: 0,
            discovery_call_count: 0,
            qualified_opp_count: 0,
            signoff_count: 0,
            active_customer_count: 0,
          },
        ],
        error: null,
      },
    });

    const wrapper = makeWrapper();

    const { result, rerender } = renderHook(({ d }: { d: Date }) => useNorthStarCounts(d), {
      wrapper,
      initialProps: { d: new Date('2026-05-01') },
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect((db.rpc as any).mock.calls.length).toBeGreaterThanOrEqual(1);

    const callsBefore = (db.rpc as any).mock.calls.length;
    rerender({ d: new Date('2026-05-15') });

    await waitFor(() => {
      expect((db.rpc as any).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
