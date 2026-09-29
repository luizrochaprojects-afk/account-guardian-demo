import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  IncumbentBlock,
  describeIncumbentWindow,
  type IncumbentDraft,
} from './IncumbentBlock';

const NOW = new Date('2026-08-05T12:00:00Z');

function draft(over: Partial<IncumbentDraft> = {}): IncumbentDraft {
  return {
    vendor: null,
    lastRenewal: null,
    cycle: 'unknown',
    evidence: null,
    ...over,
  };
}

describe('describeIncumbentWindow', () => {
  it('explains what is still missing when the window cannot be computed', () => {
    const d = describeIncumbentWindow(draft({ vendor: 'Legacy CRM' }), NOW);
    expect(d.summary).toContain('not computable');
  });

  it('states the next renewal and when the window opens', () => {
    const d = describeIncumbentWindow(
      draft({ vendor: 'Legacy CRM', lastRenewal: '2026-01-01', cycle: 'annual' }),
      NOW,
    );
    expect(d.summary).toContain('Jan 2027');
    expect(d.summary).toContain('3 Oct 2026');
    expect(d.summary).toContain('59 days');
  });

  it('reads differently once the window is already open', () => {
    const d = describeIncumbentWindow(
      draft({ vendor: 'Legacy CRM', lastRenewal: '2026-01-01', cycle: 'annual' }),
      new Date('2026-10-14T09:00:00Z'),
    );
    expect(d.summary).toContain('open since');
    expect(d.summary).toContain('11 days');
  });

  it('warns when a vendor was recorded without any evidence', () => {
    const d = describeIncumbentWindow(
      draft({ vendor: 'Legacy CRM', lastRenewal: '2026-01-01', cycle: 'annual' }),
      NOW,
    );
    expect(d.warning).toContain('No evidence');
  });

  it('drops the warning once evidence is present', () => {
    const d = describeIncumbentWindow(
      draft({
        vendor: 'Legacy CRM',
        lastRenewal: '2026-01-01',
        cycle: 'annual',
        evidence: 'we renew in January, annual contract',
      }),
      NOW,
    );
    expect(d.warning).toBeNull();
  });

  it('does not warn about evidence before a vendor is even named', () => {
    expect(describeIncumbentWindow(draft(), NOW).warning).toBeNull();
  });

  it('formats dates without drifting across timezones', () => {
    // A local-time formatter would render 2 Oct here for any UTC-negative
    // offset, which is the whole team.
    const d = describeIncumbentWindow(
      draft({ lastRenewal: '2026-01-01', cycle: 'annual' }),
      NOW,
    );
    expect(d.summary).toContain('3 Oct 2026');
  });
});

describe('IncumbentBlock', () => {
  it('renders the four capture fields', () => {
    render(<IncumbentBlock value={draft()} onChange={() => {}} now={NOW} />);
    expect(screen.getByLabelText('Incumbent')).toBeInTheDocument();
    expect(screen.getByLabelText('Last renewal')).toBeInTheDocument();
    expect(screen.getByLabelText('Contract cycle')).toBeInTheDocument();
    expect(screen.getByLabelText('Evidence')).toBeInTheDocument();
  });

  it('takes the anchor at month precision, never a day', () => {
    render(<IncumbentBlock value={draft()} onChange={() => {}} now={NOW} />);
    expect(screen.getByLabelText('Last renewal')).toHaveAttribute('type', 'month');
  });

  it('shows the derived window so the rep can sanity-check the inference', () => {
    render(
      <IncumbentBlock
        value={draft({ vendor: 'Legacy CRM', lastRenewal: '2026-01-01', cycle: 'annual' })}
        onChange={() => {}}
        now={NOW}
      />,
    );
    expect(screen.getByText(/Jan 2027/)).toBeInTheDocument();
  });
});
