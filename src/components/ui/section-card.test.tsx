import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SectionCard } from './section-card';

describe('SectionCard', () => {
  it('renders title, action and children', () => {
    render(
      <SectionCard title="Invoices" action={<button>Add invoice</button>}>
        <p>body</p>
      </SectionCard>
    );
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add invoice' })).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});
