import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IncumbentWindowActions } from './IncumbentWindowActions';

const noopAsync = async () => {};

function setup(over: Partial<React.ComponentProps<typeof IncumbentWindowActions>> = {}) {
  const props = {
    accountId: 'a1',
    onReopen: vi.fn(noopAsync),
    onSnooze: vi.fn(noopAsync),
    onDiscard: vi.fn(noopAsync),
    ...over,
  };
  render(<IncumbentWindowActions {...props} />);
  return props;
}

describe('IncumbentWindowActions', () => {
  it('offers the three ways out of a window task', () => {
    setup();
    expect(screen.getByRole('button', { name: /Reopen account/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Push out/i })).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Discard/i })).toBeInTheDocument();
  });

  it('reopens through the caller, not by writing a stage itself', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /Reopen account/i }));
    expect(props.onReopen).toHaveBeenCalledOnce();
  });

  it('pushes the window out by 30 days', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /Push out 30 days/i }));
    expect(props.onSnooze).toHaveBeenCalledWith(30);
  });

  it('will not discard until a reason is written', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Discard/i }));

    const confirm = screen.getByRole('button', { name: /Confirm discard/i });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Why/i), {
      target: { value: 'moved off CRM entirely' },
    });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    expect(props.onDiscard).toHaveBeenCalledWith('moved off CRM entirely');
  });

  it('renders nothing without an account to act on', () => {
    const { container } = render(
      <IncumbentWindowActions
        accountId={null}
        onReopen={noopAsync}
        onSnooze={noopAsync}
        onDiscard={noopAsync}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
