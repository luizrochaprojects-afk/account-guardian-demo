import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LIFECYCLE_GROUP_LABEL } from '@/lib/lifecycle';
import type { EventWithContacts } from '@/hooks/useEventsDB';

const deleteEvent = vi.fn();
const completeEvent = vi.fn();

let mockEvents: EventWithContacts[] = [];

vi.mock('@/hooks/useEventsDB', () => ({
  useEventsDB: () => ({
    events: mockEvents,
    deleteEvent,
    completeEvent,
  }),
}));

vi.mock('@/hooks/useContactsDB', () => ({
  useContactsDB: () => ({ contacts: [] }),
}));

vi.mock('@/hooks/useLifecycleHistory', () => ({
  useLifecycleHistory: () => ({ history: [] }),
}));

vi.mock('@/hooks/useSystemPropertyOptions', () => ({
  useSystemPropertyOptions: () => ({ options: ['Onboarding', 'Adoption', 'Expansion', 'Mature'] }),
}));

vi.mock('./LogInteractionDialog', () => ({
  LogInteractionDialog: () => null,
  SENTIMENTS: [
    { value: 'very_positive', emoji: '😀', label: 'Very positive' },
    { value: 'positive', emoji: '🙂', label: 'Positive' },
    { value: 'neutral', emoji: '😐', label: 'Neutral' },
    { value: 'negative', emoji: '😕', label: 'Negative' },
    { value: 'very_negative', emoji: '😡', label: 'Very negative' },
  ],
}));

vi.mock('./EditLifecycleEventDialog', () => ({
  EditLifecycleEventDialog: () => null,
}));

const { AccountTimeline } = await import('./AccountTimeline');

function makeEvent(overrides: Partial<EventWithContacts>): EventWithContacts {
  return {
    id: overrides.id || 'ev1',
    organization_id: 'org1',
    account_id: 'acc1',
    user_id: 'u1',
    title: 'Event',
    type: 'call',
    channel: 'call',
    direction: 'outbound',
    sentiment: null,
    group_label: null,
    date: '2026-01-01',
    time: null,
    scheduled_at: null,
    completed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    contact_ids: [],
    ...overrides,
  } as EventWithContacts;
}

describe('AccountTimeline', () => {
  it('hideLifecycle: regular event visible, lifecycle event excluded (no false empty state)', () => {
    mockEvents = [
      makeEvent({ id: 'lc1', title: 'Stage: Adoption', group_label: LIFECYCLE_GROUP_LABEL }),
      makeEvent({ id: 'reg1', title: 'Regular call' }),
    ];
    render(<AccountTimeline accountId="acc1" hideLifecycle />);
    expect(screen.getByText('Regular call')).toBeInTheDocument();
    expect(screen.queryByText('Stage: Adoption')).toBeNull();
    expect(screen.queryByText('No interactions yet')).toBeNull();
  });

  it('stale lifecycle filter under hideLifecycle does not produce a false empty state', () => {
    mockEvents = [
      makeEvent({ id: 'lc1', title: 'Stage: Adoption', group_label: LIFECYCLE_GROUP_LABEL }),
      makeEvent({ id: 'reg1', title: 'Regular call' }),
    ];
    const { rerender } = render(<AccountTimeline accountId="acc1" />);

    // Select the Lifecycle filter from the dropdown while it is visible.
    // Lifecycle events no longer render their raw "Stage: X" title — they
    // collapse into a thin system row showing just the destination stage (no
    // prior transition to show a "from" for in this fixture).
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Lifecycle' }));
    expect(screen.getByText('Adoption')).toBeInTheDocument();
    expect(screen.queryByText('Regular call')).toBeNull();

    // RelationshipsTab switches chips -> hideLifecycle becomes true on the
    // same component instance, while `filter` state is still 'lifecycle'.
    rerender(<AccountTimeline accountId="acc1" hideLifecycle />);

    expect(screen.getByText('Regular call')).toBeInTheDocument();
    expect(screen.queryByText('No interactions yet')).toBeNull();
  });

  it('renders exactly one "Log interaction" button when there are no events', () => {
    mockEvents = [];
    render(<AccountTimeline accountId="acc1" />);
    expect(screen.getByText('No interactions yet')).toBeInTheDocument();
    const buttons = screen.getAllByText('Log interaction');
    expect(buttons).toHaveLength(1);
  });
});
