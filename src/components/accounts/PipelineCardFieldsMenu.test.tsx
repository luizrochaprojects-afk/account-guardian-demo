import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineCardFieldsMenu } from './PipelineCardFieldsMenu';
import { PipelineCardFieldsProvider } from './PipelineCardFieldsContext';
import { defaultFieldsForPhase } from '@/lib/pipelineCardFields';
import type { PipelinePhase } from '@/lib/transitionStage';

const ORG = 'org-1';
const keyFor = (phase: PipelinePhase) =>
  `pipeline.cardFields.${phase}:${ORG}:visibleColumns`;

const openMenu = (phase: PipelinePhase) => {
  render(
    <PipelineCardFieldsProvider phase={phase} orgId={ORG}>
      <PipelineCardFieldsMenu />
    </PipelineCardFieldsProvider>,
  );
  fireEvent.click(screen.getByTitle('Card fields'));
};

const stored = (phase: PipelinePhase): string[] | null => {
  const raw = window.localStorage.getItem(keyFor(phase));
  return raw ? JSON.parse(raw) : null;
};

describe('PipelineCardFieldsMenu', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders nothing outside a provider', () => {
    const { container } = render(<PipelineCardFieldsMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers only the fields that mean something in the active phase', () => {
    openMenu('customer');
    expect(screen.getByText('Usage (4 weeks)')).toBeInTheDocument();
    expect(screen.getByText('Usage delta')).toBeInTheDocument();
    expect(screen.queryByText('Potential ARR')).not.toBeInTheDocument();
  });

  it('offers the pre-close money fields in a sales phase, and no customer signals', () => {
    openMenu('sales');
    expect(screen.getByText('Potential ARR')).toBeInTheDocument();
    expect(screen.getByText('Founder confidence')).toBeInTheDocument();
    expect(screen.queryByText('Usage (4 weeks)')).not.toBeInTheDocument();
    expect(screen.queryByText('Usage delta')).not.toBeInTheDocument();
  });

  it('shows the required field as a non-clickable, always-checked row', () => {
    openMenu('sdr');
    // Toggleable fields are buttons; the required one deliberately is not.
    expect(screen.getByText('Days in stage').closest('button')).not.toBeNull();
    expect(screen.getByText('Name').closest('button')).toBeNull();
  });

  it('persists a toggle under the phase-scoped key', () => {
    openMenu('sdr');
    fireEvent.click(screen.getByText('Tags'));
    expect(stored('sdr')).toContain('tags');
    // and it must not leak into another phase's key
    expect(stored('customer')).toBeNull();
  });

  it('turns a default-on field off', () => {
    openMenu('sdr');
    fireEvent.click(screen.getByText('Days in stage'));
    expect(stored('sdr')).not.toContain('daysInStage');
  });

  it('Reset goes back to the phase defaults', () => {
    openMenu('sdr');
    fireEvent.click(screen.getByText('Tags'));
    expect(stored('sdr')).toContain('tags');

    fireEvent.click(screen.getByText('Reset'));
    expect(stored('sdr')).toEqual(defaultFieldsForPhase('sdr'));
  });

  it('reads back the selection stored for that phase', () => {
    window.localStorage.setItem(keyFor('sdr'), JSON.stringify(['name', 'region']));
    openMenu('sdr');

    const stateOf = (label: string) =>
      screen.getByText(label).closest('button')?.querySelector('[role="checkbox"]')
        ?.getAttribute('data-state');

    expect(stateOf('Region')).toBe('checked');
    expect(stateOf('Days in stage')).toBe('unchecked');
  });
});
