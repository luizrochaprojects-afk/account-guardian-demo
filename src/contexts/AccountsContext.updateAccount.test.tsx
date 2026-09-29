import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { db } from '@/demo/db';
import { AccountsProvider, useAccounts, type Account } from './AccountsContext';

// Per the fix-wave spec: mock ONLY the db client, not useAccounts —
// this is an integration test of the real AccountsProvider/updateAccount.
vi.mock('@/demo/db', () => ({
  db: { from: vi.fn() },
}));

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { organization_id: 'org-1' }, loading: false }),
}));

// Final builder call in each chain is awaited, so it must be thenable.
function thenable(result: unknown) {
  return { then: (cb: (r: unknown) => unknown) => cb(result) };
}

function TestConsumer({ onReady }: { onReady: (updateAccount: ReturnType<typeof useAccounts>['updateAccount']) => void }) {
  const { updateAccount } = useAccounts();
  useEffect(() => { onReady(updateAccount); }, [updateAccount, onReady]);
  return null;
}

describe('AccountsContext updateAccount — sales field mapping (Critical 1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps arr into the accounts update patch and persists it', async () => {
    const eqForUpdate = vi.fn().mockReturnValue(thenable({ error: null }));
    const update = vi.fn().mockReturnValue({ eq: eqForUpdate });

    (db.from as any).mockImplementation((table: string) => {
      if (table === 'accounts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue(thenable({ data: [], error: null })),
          update,
        };
      }
      // events (stage-changed-at lookup)
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnValue(thenable({ data: [], error: null })),
      };
    });

    let updateAccount: ReturnType<typeof useAccounts>['updateAccount'] | undefined;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <AccountsProvider>
          <TestConsumer onReady={(fn) => { updateAccount = fn; }} />
        </AccountsProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(updateAccount).toBeTruthy());

    await updateAccount!('a1', { arr: 123 } as Partial<Account>);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ arr: 123 }));
    expect(eqForUpdate).toHaveBeenCalledWith('id', 'a1');
  });

  it('never maps pipeline_stage — direct writes are blocked by a DB trigger', async () => {
    const eqForUpdate = vi.fn().mockReturnValue(thenable({ error: null }));
    const update = vi.fn().mockReturnValue({ eq: eqForUpdate });

    (db.from as any).mockImplementation((table: string) => {
      if (table === 'accounts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue(thenable({ data: [], error: null })),
          update,
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnValue(thenable({ data: [], error: null })),
      };
    });

    let updateAccount: ReturnType<typeof useAccounts>['updateAccount'] | undefined;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <AccountsProvider>
          <TestConsumer onReady={(fn) => { updateAccount = fn; }} />
        </AccountsProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(updateAccount).toBeTruthy());

    await updateAccount!('a1', { pipeline_stage: 'closed_won' } as Partial<Account>);

    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({ pipeline_stage: expect.anything() }));
  });

  it('maps both owner columns independently', async () => {
    // Revenue and delivery owners are separate columns. The two rows in
    // CompanyInfoPanel share one editor component, so editing one must never
    // write the other.
    const eqForUpdate = vi.fn().mockReturnValue(thenable({ error: null }));
    const update = vi.fn().mockReturnValue({ eq: eqForUpdate });

    (db.from as any).mockImplementation((table: string) => {
      if (table === 'accounts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue(thenable({ data: [], error: null })),
          update,
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnValue(thenable({ data: [], error: null })),
      };
    });

    let updateAccount: ReturnType<typeof useAccounts>['updateAccount'] | undefined;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <AccountsProvider>
          <TestConsumer onReady={(fn) => { updateAccount = fn; }} />
        </AccountsProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(updateAccount).toBeTruthy());

    await updateAccount!('a1', { delivery_owner_id: 'u2' } as Partial<Account>);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ delivery_owner_id: 'u2' }));
    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({ revenue_owner_id: expect.anything() }));
    // account_executive is a retired column and must never be written, even
    // though a legacy database may still carry it.
    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({ account_executive: expect.anything() }));
  });
});
