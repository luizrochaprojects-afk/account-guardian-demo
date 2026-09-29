import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StagePinModal } from './StagePinModal';
import { transitionStage } from '@/lib/transitionStage';
import type { Account } from '@/contexts/AccountsContext';

vi.mock('@/lib/transitionStage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/transitionStage')>(
    '@/lib/transitionStage',
  );
  return { ...actual, transitionStage: vi.fn() };
});

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
  },
}));

const account = {
  id: 'acc-1',
  name: 'Northwind Supply',
  pipeline_stage: 'steady',
} as unknown as Account;

function renderModal(onOpenChange = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <StagePinModal
        open
        onOpenChange={onOpenChange}
        account={account}
        stage={'at_risk' as never}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('StagePinModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts with the confirm button disabled — a pin with no reason is indistinguishable from an accidental drag', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /^Pin to/ })).toBeDisabled();
  });

  it('enables confirm once a reason is typed, and sends it as pin_reason', async () => {
    vi.mocked(transitionStage).mockResolvedValue({} as never);
    const { onOpenChange } = renderModal();

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'client paused for August, not churn' } });
    const confirm = screen.getByRole('button', { name: /^Pin to/ });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(transitionStage).toHaveBeenCalledWith('acc-1', 'at_risk', {
        pin_reason: 'client paused for August, not churn',
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('trims the reason before sending — whitespace is not a justification', async () => {
    vi.mocked(transitionStage).mockResolvedValue({} as never);
    renderModal();

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: '   paused   ' } });
    fireEvent.click(screen.getByRole('button', { name: /^Pin to/ }));

    await waitFor(() =>
      expect(transitionStage).toHaveBeenCalledWith('acc-1', 'at_risk', {
        pin_reason: 'paused',
      }),
    );
  });

  it('keeps the dialog open and surfaces the message when the RPC rejects', async () => {
    vi.mocked(transitionStage).mockRejectedValue(new Error('23514'));
    const { onOpenChange } = renderModal();

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'because' } });
    fireEvent.click(screen.getByRole('button', { name: /^Pin to/ }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('23514'));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('renders nothing when there is no pending move', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <StagePinModal
          open
          onOpenChange={vi.fn()}
          account={null}
          stage={null}
        />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
