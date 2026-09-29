import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuickAddActivity } from './QuickAddActivity';

const logActivity = vi.fn();

vi.mock('@/hooks/useActivities', () => ({
  useActivities: () => ({ logActivity, activities: [], loading: false, refetch: vi.fn() }),
}));

vi.mock('@/contexts/AccountsContext', () => ({
  useAccounts: () => ({ accounts: [] }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('QuickAddActivity', () => {
  beforeEach(() => {
    logActivity.mockReset();
    logActivity.mockResolvedValue({ data: { id: 'x' }, error: null });
  });

  it('logs a manual outreach with inferred direction/outcome on the default path', async () => {
    render(
      <QuickAddActivity
        accountId="acc-1"
        accountName="MapleStreetClinics"
        trigger={<button>open</button>}
      />,
    );

    // Dialog is closed until the trigger is clicked.
    expect(screen.queryByText('Log', { selector: 'button' })).toBeNull();
    fireEvent.click(screen.getByText('open'));

    // Submit with all defaults (channel=whatsapp, kind=outreach).
    fireEvent.click(screen.getByRole('button', { name: 'Log' }));

    await waitFor(() => expect(logActivity).toHaveBeenCalledTimes(1));
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 'acc-1',
        channel: 'whatsapp',
        activity_type: 'outreach',  // the live enum value
        direction: 'outbound',      // inferred from the kind
        outcome: 'no_response',     // default outcome for that kind
      }),
    );
  });
});
