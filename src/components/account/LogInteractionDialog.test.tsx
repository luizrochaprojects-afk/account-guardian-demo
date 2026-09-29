import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useEventsDB', () => ({
  useEventsDB: () => ({ events: [], addEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn(), completeEvent: vi.fn() }),
}));
vi.mock('@/hooks/useContactsDB', () => ({ useContactsDB: () => ({ contacts: [] }) }));

const { LogInteractionDialog } = await import('./LogInteractionDialog');

describe('LogInteractionDialog', () => {
  it('renders sentence-case title when open', () => {
    render(<LogInteractionDialog accountId="a1" open onOpenChange={() => {}} />);
    expect(screen.getByText('Log interaction')).toBeInTheDocument();
  });
  it('renders nothing when closed', () => {
    render(<LogInteractionDialog accountId="a1" open={false} onOpenChange={() => {}} />);
    expect(screen.queryByText('Log interaction')).toBeNull();
  });
});
