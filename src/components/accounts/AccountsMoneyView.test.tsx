import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Account } from '@/contexts/AccountsContext';

vi.mock('@/demo/db', () => ({
  db: {
    from: () => ({
      select: () => ({
        eq: () => ({ is: () => Promise.resolve({ data: [], error: null }) }),
      }),
    }),
  },
}));

vi.mock('@/hooks/useMoney', () => ({
  useMoney: () => ({ money: (n: number) => `$${n}` }),
}));

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { organization_id: 'org-1' } }),
}));

vi.mock('@/hooks/useHygieneCounters', () => ({
  useHygieneCounters: () => ({ rows: [], isLoading: false }),
}));

const updateAccount = vi.fn().mockResolvedValue(undefined);
vi.mock('@/contexts/AccountsContext', () => ({
  useAccounts: () => ({ updateAccount }),
  accountsListQueryKey: (orgId: string | undefined) => ['accounts', orgId] as const,
}));

const requestStageChange = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useStageTransition', () => ({
  useStageTransition: () => ({
    requestStageChange,
    reasonGatedStage: null,
    reasonGatedAccount: null,
    closeReasonModal: vi.fn(),
  }),
}));

const addTask = vi.fn().mockResolvedValue({ data: { id: 'task-new' }, error: null });
const updateTask = vi.fn().mockResolvedValue(null);
vi.mock('@/hooks/useProjectsDB', () => ({
  useTasksDB: () => ({ addTask, updateTask }),
}));

vi.mock('@/components/accounts/StageReasonModal', () => ({
  StageReasonModal: () => null,
}));

const AccountsMoneyView = (await import('./AccountsMoneyView')).default;

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Acme',
    pipeline_stage: 'business_case',
    mrr: 10000,
    arr: 120000,
    next_step: 'Discuss proposal',
    next_step_due: '2026-08-14',
    next_step_task_id: 'task-1',
    revenue_owner_id: 'user-1',
    ...overrides,
  } as Account;
}

function renderView(accounts: Account[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AccountsMoneyView accounts={accounts} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AccountsMoneyView — inline editing', () => {
  beforeEach(() => {
    updateAccount.mockClear();
    requestStageChange.mockClear();
    addTask.mockClear();
    updateTask.mockClear();
  });

  it('stage: click label → pick an option → requestStageChange(account, stage)', async () => {
    const acct = makeAccount();
    renderView([acct]);

    fireEvent.click(await screen.findByText('Business case'));
    // defaultOpen: the listbox is open as soon as the Select mounts.
    fireEvent.click(await screen.findByRole('option', { name: 'Won' }));

    expect(requestStageChange).toHaveBeenCalledWith(acct, 'closed_won');
  });

  it('projected: type a value and press Enter → updateAccount with mrr and derived arr', async () => {
    renderView([makeAccount()]);

    // The header total renders the same string — target the clickable cell.
    fireEvent.click(await screen.findByRole('button', { name: '$10000' }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    expect(updateAccount).toHaveBeenCalledWith('a1', { mrr: 5000, arr: 60000 });
  });

  it('projected: Escape cancels without writing', async () => {
    renderView([makeAccount()]);

    // The header total renders the same string — target the clickable cell.
    fireEvent.click(await screen.findByRole('button', { name: '$10000' }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);

    expect(updateAccount).not.toHaveBeenCalled();
  });

  it('next step with a linked task → updateTask on that task', async () => {
    renderView([makeAccount()]);

    fireEvent.click(await screen.findByText('Discuss proposal'));
    const input = screen.getByPlaceholderText('Next step');
    fireEvent.change(input, { target: { value: 'Send contract' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(updateTask).toHaveBeenCalledWith('task-1', {
      name: 'Send contract',
      due_date: '2026-08-14',
    });
    expect(addTask).not.toHaveBeenCalled();
  });

  it('next step without a task ("no next step") → addTask with category next_step', async () => {
    renderView([
      makeAccount({ next_step: null, next_step_due: null, next_step_task_id: null }),
    ]);

    fireEvent.click(await screen.findByText('no next step'));
    const input = screen.getByPlaceholderText('Next step');
    fireEvent.change(input, { target: { value: 'Agendar call' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(addTask).toHaveBeenCalledWith({
      organization_id: 'org-1',
      account_id: 'a1',
      name: 'Agendar call',
      due_date: null,
      status: 'todo',
      category: 'next_step',
      assign_to: 'user-1',
    });
    expect(updateTask).not.toHaveBeenCalled();
  });

  it('next step: committing empty text is a cancel — no task write', async () => {
    renderView([
      makeAccount({ next_step: null, next_step_due: null, next_step_task_id: null }),
    ]);

    fireEvent.click(await screen.findByText('no next step'));
    const input = screen.getByPlaceholderText('Next step');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(addTask).not.toHaveBeenCalled();
    expect(updateTask).not.toHaveBeenCalled();
  });
});
