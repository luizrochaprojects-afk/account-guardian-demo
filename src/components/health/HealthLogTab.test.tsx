import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// jsdom has no PointerEvent, and Radix's SelectTrigger opens on pointerdown —
// without this, fireEvent.pointerDown degrades to a bare Event with no `button`
// and the listbox never opens.
if (!globalThis.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId?: number;
    pointerType?: string;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.pointerType = params.pointerType ?? 'mouse';
    }
  }
  // @ts-expect-error jsdom lacks a native PointerEvent
  globalThis.PointerEvent = PointerEventPolyfill;
}

const insert = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/demo/db', () => ({
  db: {
    from: () => ({
      insert,
      select: () => ({
        eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }),
      }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    rpc: () => Promise.resolve({ data: 'org1' }),
  },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

const mockProfile = vi.fn();
vi.mock('@/contexts/HealthConfigContext', () => ({
  useHealthConfig: () => ({ profiles: [] }),
  useAccountHealthProfile: () => mockProfile(),
}));
vi.mock('@/contexts/AccountsContext', () => ({
  useAccounts: () => ({
    accounts: [{ id: 'a1', name: 'Acme', lifecycleStage: 'target' }],
  }),
}));

const { HealthLogTab } = await import('./HealthLogTab');

/**
 * Actually drive the Radix Select. This has to be real: the save button is also
 * disabled while no account is selected, so a no-op helper would make every
 * guard assertion below pass for the wrong reason.
 */
function selectAccount() {
  fireEvent.pointerDown(screen.getByRole('combobox'), { button: 0, ctrlKey: false });
  fireEvent.click(screen.getByRole('option', { name: 'Acme' }));
}

describe('HealthLogTab', () => {
  beforeEach(() => {
    insert.mockClear();
  });

  it('will not log an update when no profile covers the account stage', () => {
    // Regression guard: an unmapped stage resolves to no profile, so metrics is
    // empty. Saving anyway writes total_score 0, which the DB trigger copies to
    // accounts.health_score — where every board bands 0 as "at risk". A lead
    // would be reported as a crisis.
    mockProfile.mockReturnValue(null);
    render(<HealthLogTab />);
    selectAccount();

    const save = screen.getByRole('button', { name: /log update/i });
    expect(save).toBeDisabled();

    fireEvent.click(save);
    expect(insert).not.toHaveBeenCalled();
  });

  it('will not log an update when the profile exists but has no metrics', () => {
    mockProfile.mockReturnValue({ id: 'p1', name: 'Empty', metrics: [] });
    render(<HealthLogTab />);
    selectAccount();

    expect(screen.getByRole('button', { name: /log update/i })).toBeDisabled();
  });

  it('enables logging once the resolved profile has metrics', () => {
    mockProfile.mockReturnValue({
      id: 'p1',
      name: 'Active Customers',
      metrics: [{
        id: 'm1',
        name: 'Weekly active users',
        weight: 30,
        type: 'number',
        poor: { operator: '<', value: 10 },
        concerning: { operator: '<', value: 50 },
        healthy: { operator: '>=', value: 50 },
      }],
    });
    render(<HealthLogTab />);
    selectAccount();

    expect(screen.getByRole('button', { name: /log update/i })).not.toBeDisabled();
  });
});
