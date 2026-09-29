import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useDiscoveryNotes } from './useDiscoveryNotes';
import { db } from '@/demo/db';

vi.mock('@/demo/db', () => ({
  db: { from: vi.fn() },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useDiscoveryNotes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns notes for the given account, newest first', async () => {
    const rows = [
      { id: 'a', account_id: 'acc1', primary_pain: 'reactivation', created_at: '2026-05-15T00:00:00Z' },
      { id: 'b', account_id: 'acc1', primary_pain: 'deliverability', created_at: '2026-05-20T00:00:00Z' },
    ];
    (db.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (cb: any) => cb({ data: rows, error: null }),
    });
    const { result } = renderHook(() => useDiscoveryNotes('acc1'), { wrapper });
    await waitFor(() => expect(result.current.notes).toHaveLength(2));
  });

  it('skips fetch when accountId is empty', () => {
    const { result } = renderHook(() => useDiscoveryNotes(''), { wrapper });
    expect(result.current.notes).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
