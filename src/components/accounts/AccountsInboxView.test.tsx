import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useAgentSuggestions', () => ({
  useAgentSuggestions: () => ({
    suggestions: [],
    isLoading: false,
    approve: vi.fn(),
    reject: vi.fn(),
    batchApprove: vi.fn(),
    isApproving: false,
    isRejecting: false,
  }),
}));
vi.mock('@/hooks/useAgentSettings', () => ({ useAgentSettings: () => ({ data: { enabled: true } }) }));
vi.mock('@/contexts/AccountsContext', () => ({ useAccounts: () => ({ accounts: [] }) }));

const { default: AccountsInboxView } = await import('./AccountsInboxView');

describe('AccountsInboxView', () => {
  it('does not render "Agent Inbox" heading', () => {
    render(<MemoryRouter><AccountsInboxView /></MemoryRouter>);
    expect(screen.queryByRole('heading', { name: /agent inbox/i })).toBeNull();
  });

  it('does not render the account filter Select inside its own body', () => {
    render(<MemoryRouter><AccountsInboxView /></MemoryRouter>);
    expect(screen.queryByText('All accounts')).toBeNull();
  });
});
