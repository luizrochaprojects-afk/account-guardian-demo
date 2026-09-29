import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useContactsDB', () => ({
  useContactsDB: () => ({ contacts: [], addContact: vi.fn(), updateContact: vi.fn(), deleteContact: vi.fn() }),
}));

const { ContactDialog } = await import('./ContactDialog');

describe('ContactDialog', () => {
  it('renders Add contact title when open without editing contact', () => {
    render(<ContactDialog accountId="a1" open onOpenChange={() => {}} />);
    expect(screen.getByText('Add contact')).toBeInTheDocument();
  });
});
