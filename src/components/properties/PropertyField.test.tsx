import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { CustomProperty } from '@/hooks/useCustomProperties';

vi.mock('@/hooks/useOrgSettings', () => ({ useOrgSettings: () => ({ currencySymbol: '$', currencyCode: 'USD' }) }));

const { PropertyField } = await import('./PropertyField');

const selectProp: CustomProperty = {
  id: 'p1', organization_id: 'org1', entity_type: 'account', key: 'segment', label: 'Segment',
  type: 'select', options: ['SMB', 'Enterprise'], description: null, is_required: false,
  is_system: true, show_in_create: true, default_value: null, position: 0,
  created_at: '', updated_at: '',
} as CustomProperty;

describe('PropertyField — autoOpen / onDismiss', () => {
  it('opens a select on mount so a single click on the row is enough', async () => {
    render(<PropertyField property={selectProp} value={null} onChange={vi.fn()} autoOpen />);

    // Options live in a portal; they only exist once the menu is open.
    expect(await screen.findByText('SMB')).toBeInTheDocument();
    expect(screen.getByText('Enterprise')).toBeInTheDocument();
  });

  it('stays closed without autoOpen', () => {
    render(<PropertyField property={selectProp} value={null} onChange={vi.fn()} />);
    expect(screen.queryByText('Enterprise')).not.toBeInTheDocument();
  });

  it('calls onDismiss when the select closes', async () => {
    const onDismiss = vi.fn();
    render(<PropertyField property={selectProp} value={null} onChange={vi.fn()} autoOpen onDismiss={onDismiss} />);

    await screen.findByText('Enterprise');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
  });

  it('does not call onDismiss while a multi_select is still open', async () => {
    const onDismiss = vi.fn();
    const onChange = vi.fn();
    const multiProp = { ...selectProp, type: 'multi_select', options: ['Email', 'Chat'] } as CustomProperty;
    render(<PropertyField property={multiProp} value={[]} onChange={onChange} autoOpen onDismiss={onDismiss} />);

    fireEvent.click(await screen.findByText('Email'));

    expect(onChange).toHaveBeenCalledWith(['Email']);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText('Chat')).toBeInTheDocument();
  });
});

describe('formatPropertyValue — the read-only surface', () => {
  it('renders a month at month precision, without timezone drift', async () => {
    const { formatPropertyValue } = await import('./PropertyField');
    const monthProp = { ...selectProp, type: 'month', options: [] } as CustomProperty;
    // UTC midnight: a Date-based formatter renders Dec 2025 west of UTC.
    expect(formatPropertyValue(monthProp, '2026-01-01')).toBe('Jan 2026');
  });

  it('shows the option label, not the stored enum member', async () => {
    const { formatPropertyValue } = await import('./PropertyField');
    const cycleProp = {
      ...selectProp,
      type: 'select',
      options: ['annual', 'biennial'],
      option_labels: { annual: 'Annual', biennial: 'Every 2 years' },
    } as CustomProperty;
    expect(formatPropertyValue(cycleProp, 'biennial')).toBe('Every 2 years');
  });

  it('falls back to the raw value when a select has no labels', async () => {
    const { formatPropertyValue } = await import('./PropertyField');
    expect(formatPropertyValue(selectProp, 'SMB')).toBe('SMB');
  });
});
