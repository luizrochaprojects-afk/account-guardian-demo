import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SalesFunnel } from './SalesFunnel';
import type { FunnelStep } from '@/lib/salesFunnel';

vi.mock('@/hooks/useMoney', () => ({
  useMoney: () => ({ moneyCompact: (n: number) => `$${n}` }),
}));

function step(overrides: Partial<FunnelStep> & { step: string; label: string }): FunnelStep {
  return {
    entered: 0,
    value: 0,
    converted: null,
    rate: null,
    medianDaysToNext: null,
    isSynthetic: false,
    ...overrides,
  };
}

function renderFunnel(
  steps: FunnelStep[],
  isLoading = false,
  includeLegacy = false,
  onIncludeLegacyChange = vi.fn(),
) {
  return {
    onIncludeLegacyChange,
    ...render(
      <MemoryRouter>
        <SalesFunnel
          steps={steps}
          isLoading={isLoading}
          includeLegacy={includeLegacy}
          onIncludeLegacyChange={onIncludeLegacyChange}
        />
      </MemoryRouter>,
    ),
  };
}

describe('SalesFunnel', () => {
  it('shows the empty state when nothing entered the funnel in the window', () => {
    renderFunnel([
      step({ step: 'working', label: 'Working' }),
      step({ step: 'sign_off', label: 'Sign-off' }),
    ]);
    expect(screen.getByText(/No stage movement in this window\./)).toBeInTheDocument();
  });

  it('renders deals, money, rate and days per step', () => {
    renderFunnel([
      step({
        step: 'working', label: 'Working',
        entered: 10, value: 120000, converted: 5, rate: 0.5, medianDaysToNext: 7,
      }),
    ]);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('$120000')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('7d')).toBeInTheDocument();
  });

  it("renders '—' for a null rate and zero value — never a fabricated 0%", () => {
    renderFunnel([
      step({ step: 'working', label: 'Working', entered: 3, value: 0, rate: null }),
    ]);
    // One '—' for the value column, one for the rate, one for the days column.
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('links real stages to their account list but not the synthetic won step', () => {
    renderFunnel([
      step({ step: 'sign_off', label: 'Sign-off', entered: 2 }),
      step({
        step: 'first_usage', label: 'First usage (true win)',
        entered: 1, isSynthetic: true,
      }),
    ]);
    expect(screen.getByRole('link', { name: 'Sign-off' }))
      .toHaveAttribute('href', '/accounts?stage=sign_off');
    expect(screen.queryByRole('link', { name: 'First usage (true win)' })).not.toBeInTheDocument();
  });

  it('shows skeletons while loading', () => {
    const { container } = renderFunnel([], true);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText(/No stage movement in this window\./)).not.toBeInTheDocument();
  });

  // The legacy backstop shipped once as an invisible always-on behaviour and that
  // is how the funnel's tail and the "True wins" card drifted apart. These two
  // tests are the guard: the mode must be visible on screen, and off by default.
  it('says the window is the only thing counted when legacy is off', () => {
    renderFunnel([
      step({ step: 'working', label: 'Working', entered: 4, rate: 0.5 }),
    ]);
    expect(
      screen.getByText(/Only movement inside the window counts/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Legacy accounts included/)).not.toBeInTheDocument();
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('warns that the tail is current state when legacy is on', () => {
    renderFunnel(
      [step({ step: 'working', label: 'Working', entered: 4, rate: 0.5 })],
      false,
      true,
    );
    expect(screen.getByText(/Legacy accounts included/)).toBeInTheDocument();
    expect(
      screen.getByText(/current state, not flow, and will read higher than the True wins card/),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('offers the legacy switch as the way out of an empty window', () => {
    renderFunnel([step({ step: 'working', label: 'Working' })]);
    expect(
      screen.getByText(/turn on "Include legacy accounts" to count them/),
    ).toBeInTheDocument();
  });
});
