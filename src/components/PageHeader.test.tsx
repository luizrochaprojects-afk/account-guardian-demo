import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders breadcrumb-only when title omitted', () => {
    render(
      <MemoryRouter>
        <PageHeader breadcrumbs={[{ label: 'Accounts', href: '/accounts' }, { label: 'Bluebird Health' }]} />
      </MemoryRouter>
    );
    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.getByText('Bluebird Health')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).toBeNull();
  });
  it('still renders h1 when title given', () => {
    render(<MemoryRouter><PageHeader title="All Accounts" /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'All Accounts' })).toBeInTheDocument();
  });
});
