import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCustomerSignals } from './useCustomerSignals';
import { db } from '@/demo/db';

vi.mock('@/demo/db', () => ({
  db: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: {
      id: 'p1',
      user_id: 'user-1',
      display_name: 'User',
      avatar_url: null,
      organization_id: 'org-1',
    },
    loading: false,
    updateProfile: vi.fn(),
    refetch: vi.fn(),
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Mock the `.from(...).select(...).eq(...)` chain the hook uses. */
const mockRows = (rows: Record<string, unknown>[], error: unknown = null) => {
  const eq = vi.fn().mockResolvedValue({ data: rows, error });
  (db.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    select: vi.fn().mockReturnValue({ eq }),
  });
  return eq;
};

/**
 * PostgREST returns Postgres `numeric` as a STRING, and the view leaves a
 * column NULL when the value is not computable. Both facts matter downstream:
 * `customerSignals.ts` treats `null` as "no baseline", which is a different
 * classification outcome from zero.
 */
const viewRow = (over: Record<string, unknown> = {}) => ({
  account_id: 'acc-1',
  organization_id: 'org-1',
  pipeline_stage: 'steady',
  pipeline_phase: 'customer',
  customer_since: '2025-01-01',
  first_usage_at: '2025-01-15T00:00:00Z',
  last_usage_at: '2026-07-27T00:00:00Z',
  reactivated_at: null,
  customer_stage_pinned_at: null,
  customer_risk_reason: null,
  usage_4w: '4000.00',
  usage_prev_4w: '3200.00',
  usage_delta_pct: '0.2500',
  weeks_since_last_usage: '1',
  days_since_last_activity: 3,
  health_score: '80',
  health_logged_at: '2026-08-01T00:00:00Z',
  health_delta_30d: 5,
  cohort: 'M1+',
  signal_quality: 'full',
  ...over,
});

describe('useCustomerSignals — list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the account_customer_signals view', async () => {
    mockRows([viewRow()]);
    const { result } = renderHook(() => useCustomerSignals(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(db.from).toHaveBeenCalledWith('account_customer_signals');
  });

  it('coerces Postgres numeric strings into real numbers', async () => {
    mockRows([viewRow()]);
    const { result } = renderHook(() => useCustomerSignals(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    const r = result.current.rows[0];
    expect(r.usage4w).toBe(4000);
    expect(r.usagePrev4w).toBe(3200);
    expect(r.usageDeltaPct).toBe(0.25);
    expect(r.weeksSinceLastUsage).toBe(1);
    expect(r.healthScore).toBe(80);
    expect(typeof r.usage4w).toBe('number');
  });

  it('maps every snake_case column onto the classifier input', async () => {
    mockRows([viewRow({ customer_risk_reason: 'contracting', reactivated_at: '2026-06-01T00:00:00Z' })]);
    const { result } = renderHook(() => useCustomerSignals(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    expect(result.current.rows[0]).toEqual({
      accountId: 'acc-1',
      pipelineStage: 'steady',
      customerSince: '2025-01-01',
      firstUsageAt: '2025-01-15T00:00:00Z',
      lastUsageAt: '2026-07-27T00:00:00Z',
      reactivatedAt: '2026-06-01T00:00:00Z',
      customerStagePinnedAt: null,
      usage4w: 4000,
      usagePrev4w: 3200,
      usageDeltaPct: 0.25,
      weeksSinceLastUsage: 1,
      daysSinceLastActivity: 3,
      healthScore: 80,
      healthLoggedAt: '2026-08-01T00:00:00Z',
      cohort: 'M1+',
      signalQuality: 'full',
      healthDelta30d: 5,
      customerRiskReason: 'contracting',
    });
  });

  it('preserves NULL as null — collapsing it to 0 would change the classification', async () => {
    mockRows([
      viewRow({
        usage_delta_pct: null,
        weeks_since_last_usage: null,
        first_usage_at: null,
        last_usage_at: null,
        health_score: null,
        health_delta_30d: null,
        days_since_last_activity: null,
        cohort: null,
      }),
    ]);
    const { result } = renderHook(() => useCustomerSignals(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    const r = result.current.rows[0];
    expect(r.usageDeltaPct).toBeNull();
    expect(r.weeksSinceLastUsage).toBeNull();
    expect(r.firstUsageAt).toBeNull();
    expect(r.lastUsageAt).toBeNull();
    expect(r.healthScore).toBeNull();
    expect(r.healthDelta30d).toBeNull();
    expect(r.daysSinceLastActivity).toBeNull();
    expect(r.cohort).toBeNull();
  });

  it('keeps a genuine zero distinct from a missing value', async () => {
    mockRows([viewRow({ usage_delta_pct: '0.0000', weeks_since_last_usage: 0 })]);
    const { result } = renderHook(() => useCustomerSignals(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    expect(result.current.rows[0].usageDeltaPct).toBe(0);
    expect(result.current.rows[0].weeksSinceLastUsage).toBe(0);
  });

  it('defaults the usage totals to 0, because a sum with no rows really is zero', async () => {
    mockRows([viewRow({ usage_4w: null, usage_prev_4w: null })]);
    const { result } = renderHook(() => useCustomerSignals(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    expect(result.current.rows[0].usage4w).toBe(0);
    expect(result.current.rows[0].usagePrev4w).toBe(0);
  });

  it('scopes the query to the org', async () => {
    const eq = mockRows([viewRow()]);
    const { result } = renderHook(() => useCustomerSignals(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(eq).toHaveBeenCalledWith('organization_id', 'org-1');
  });

  it('drops rows with no account_id — a view can emit nullable columns', async () => {
    mockRows([viewRow(), viewRow({ account_id: null })]);
    const { result } = renderHook(() => useCustomerSignals(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toHaveLength(1);
  });

  it('indexes rows by account id', async () => {
    mockRows([viewRow({ account_id: 'a' }), viewRow({ account_id: 'b' })]);
    const { result } = renderHook(() => useCustomerSignals(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.byAccount.get('b')?.accountId).toBe('b');
  });

  it('falls back to signal_quality "none" rather than assuming fresh data', async () => {
    mockRows([viewRow({ signal_quality: null })]);
    const { result } = renderHook(() => useCustomerSignals(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0].signalQuality).toBe('none');
  });
});

describe('useCustomerSignals — reclassify', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports how many accounts moved (the RPC returns only movers)', async () => {
    mockRows([viewRow()]);
    (db.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ moved_account_id: 'a' }, { moved_account_id: 'b' }],
      error: null,
    });
    const { result } = renderHook(() => useCustomerSignals(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    const out = await result.current.reclassify();
    expect(db.rpc).toHaveBeenCalledWith('classify_customer_stages', { _org_id: 'org-1' });
    expect(out.moved).toBe(2);
    expect(out.error).toBeNull();
  });

  it('reports zero moves without treating it as a failure', async () => {
    mockRows([viewRow()]);
    (db.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      error: null,
    });
    const { result } = renderHook(() => useCustomerSignals(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    const out = await result.current.reclassify();
    expect(out).toEqual({ moved: 0, error: null });
  });

  it('surfaces the error instead of claiming success', async () => {
    mockRows([viewRow()]);
    (db.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    });
    const { result } = renderHook(() => useCustomerSignals(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    const out = await result.current.reclassify();
    expect(out.moved).toBe(0);
    expect(out.error).toEqual({ message: 'permission denied' });
  });
});
