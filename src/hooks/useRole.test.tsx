import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useRole } from './useRole';
import { db } from '@/demo/db';

vi.mock('@/demo/db', () => ({
  db: { rpc: vi.fn() },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns role when present', async () => {
    (db.rpc as any).mockResolvedValue({ data: 'founder', error: null });
    const { result } = renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(result.current.role).toBe('founder'));
    expect(result.current.isFounder).toBe(true);
  });

  it('returns undefined on error', async () => {
    (db.rpc as any).mockResolvedValue({ data: null, error: { message: 'x' } });
    const { result } = renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.role).toBeUndefined();
    expect(result.current.isFounder).toBe(false);
  });
});
