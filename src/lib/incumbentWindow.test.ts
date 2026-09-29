import { describe, it, expect } from 'vitest';
import {
  computeIncumbentWindow,
  toMonthAnchor,
  normalizeVendor,
  KNOWN_INCUMBENT_VENDORS,
  DEFAULT_INCUMBENT_LEAD_DAYS,
  type IncumbentInput,
} from './incumbentWindow';

/** Every test states `now` explicitly — the module is pure and never reads the clock. */
const NOW = new Date('2026-08-05T12:00:00Z');

function input(over: Partial<IncumbentInput> = {}): IncumbentInput {
  return {
    lastRenewal: null,
    cycle: 'unknown',
    snoozedUntil: null,
    disabledReason: null,
    ...over,
  };
}

describe('toMonthAnchor', () => {
  it('normalizes any day of the month to the first', () => {
    expect(toMonthAnchor('2026-01-23')).toBe('2026-01-01');
  });

  it('leaves an already-normalized anchor untouched', () => {
    expect(toMonthAnchor('2026-01-01')).toBe('2026-01-01');
  });

  it('returns null for a missing date', () => {
    expect(toMonthAnchor(null)).toBeNull();
  });
});

describe('normalizeVendor', () => {
  it('collapses casing to the canonical label so aggregation holds', () => {
    expect(normalizeVendor('legacy crm')).toBe('Legacy CRM');
    expect(normalizeVendor('IN-HOUSE TOOL')).toBe('In-house tool');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeVendor('  Spreadsheets  ')).toBe('Spreadsheets');
  });

  it('keeps an unrecognized vendor as typed, only trimmed', () => {
    expect(normalizeVendor('  Acme Suite ')).toBe('Acme Suite');
  });

  it('returns null for an empty or missing value', () => {
    expect(normalizeVendor('   ')).toBeNull();
    expect(normalizeVendor(null)).toBeNull();
  });

  it('always offers an escape hatch for an incumbent nobody listed', () => {
    // A rep blocked by a missing option types nothing at all.
    expect(KNOWN_INCUMBENT_VENDORS).toContain('Other');
    expect(KNOWN_INCUMBENT_VENDORS).toContain('In-house tool');
  });
});

describe('computeIncumbentWindow — when there is nothing to compute', () => {
  it('reports none without an anchor', () => {
    const w = computeIncumbentWindow(input(), NOW);
    expect(w.state).toBe('none');
    expect(w.nextRenewalEstimate).toBeNull();
    expect(w.opensAt).toBeNull();
  });

  it('reports none when the cycle is unknown, even with an anchor', () => {
    const w = computeIncumbentWindow(
      input({ lastRenewal: '2026-01-01', cycle: 'unknown' }),
      NOW,
    );
    expect(w.state).toBe('none');
    expect(w.nextRenewalEstimate).toBeNull();
  });

  it('reports disabled when a discard reason was recorded, ignoring the anchor', () => {
    const w = computeIncumbentWindow(
      input({
        lastRenewal: '2026-01-01',
        cycle: 'annual',
        disabledReason: 'switched category',
      }),
      NOW,
    );
    expect(w.state).toBe('disabled');
  });
});

describe('computeIncumbentWindow — next renewal', () => {
  it('rolls an annual anchor forward across the year boundary', () => {
    // Anchor jan/2026, today is aug/2026: the january renewal is behind us.
    const w = computeIncumbentWindow(
      input({ lastRenewal: '2026-01-01', cycle: 'annual' }),
      NOW,
    );
    expect(w.nextRenewalEstimate).toBe('2027-01-01');
  });

  it('rolls forward across several missed cycles', () => {
    const w = computeIncumbentWindow(
      input({ lastRenewal: '2021-03-01', cycle: 'annual' }),
      NOW,
    );
    expect(w.nextRenewalEstimate).toBe('2027-03-01');
  });

  it('steps 24 months on a biennial cycle', () => {
    const w = computeIncumbentWindow(
      input({ lastRenewal: '2026-03-01', cycle: 'biennial' }),
      NOW,
    );
    expect(w.nextRenewalEstimate).toBe('2028-03-01');
  });

  it('steps one month on a monthly cycle', () => {
    const w = computeIncumbentWindow(
      input({ lastRenewal: '2026-01-01', cycle: 'monthly' }),
      NOW,
    );
    expect(w.nextRenewalEstimate).toBe('2026-09-01');
  });

  it('keeps an anchor that is already in the future', () => {
    const w = computeIncumbentWindow(
      input({ lastRenewal: '2027-05-01', cycle: 'annual' }),
      NOW,
    );
    expect(w.nextRenewalEstimate).toBe('2027-05-01');
  });

  it('treats a renewal falling today as still ahead', () => {
    const w = computeIncumbentWindow(
      input({ lastRenewal: '2026-08-01', cycle: 'annual' }),
      new Date('2026-08-01T12:00:00Z'),
    );
    expect(w.nextRenewalEstimate).toBe('2026-08-01');
  });
});

describe('computeIncumbentWindow — the window', () => {
  it('opens the configured lead time before the renewal', () => {
    const w = computeIncumbentWindow(
      input({ lastRenewal: '2026-01-01', cycle: 'annual' }),
      NOW,
    );
    // 2027-01-01 minus 90 days.
    expect(w.opensAt).toBe('2026-10-03');
    expect(DEFAULT_INCUMBENT_LEAD_DAYS).toBe(90);
  });

  it('honours a custom lead time', () => {
    const w = computeIncumbentWindow(
      input({ lastRenewal: '2026-01-01', cycle: 'annual' }),
      NOW,
      30,
    );
    expect(w.opensAt).toBe('2026-12-02');
  });

  it('is scheduled while the opening date is still ahead', () => {
    const w = computeIncumbentWindow(
      input({ lastRenewal: '2026-01-01', cycle: 'annual' }),
      NOW,
    );
    expect(w.state).toBe('scheduled');
    expect(w.daysUntilOpen).toBe(59);
  });

  it('is open once the opening date has arrived', () => {
    const w = computeIncumbentWindow(
      input({ lastRenewal: '2026-01-01', cycle: 'annual' }),
      new Date('2026-10-14T09:00:00Z'),
    );
    expect(w.state).toBe('open');
    expect(w.daysUntilOpen).toBe(-11);
  });

  it('is open on the opening date itself', () => {
    const w = computeIncumbentWindow(
      input({ lastRenewal: '2026-01-01', cycle: 'annual' }),
      new Date('2026-10-03T23:00:00Z'),
    );
    expect(w.state).toBe('open');
    expect(w.daysUntilOpen).toBe(0);
  });

  it('closes the window and schedules the next cycle once the renewal passes', () => {
    // 2027-01-02: the january renewal is gone, the account just re-signed.
    const w = computeIncumbentWindow(
      input({ lastRenewal: '2026-01-01', cycle: 'annual' }),
      new Date('2027-01-02T09:00:00Z'),
    );
    expect(w.state).toBe('scheduled');
    expect(w.nextRenewalEstimate).toBe('2028-01-01');
  });
});

describe('computeIncumbentWindow — snooze', () => {
  it('suppresses an open window while the snooze is in the future', () => {
    const w = computeIncumbentWindow(
      input({
        lastRenewal: '2026-01-01',
        cycle: 'annual',
        snoozedUntil: '2026-11-01',
      }),
      new Date('2026-10-14T09:00:00Z'),
    );
    expect(w.state).toBe('snoozed');
    // The underlying dates stay visible so the UI can explain the snooze.
    expect(w.nextRenewalEstimate).toBe('2027-01-01');
  });

  it('stops suppressing once the snooze has expired', () => {
    const w = computeIncumbentWindow(
      input({
        lastRenewal: '2026-01-01',
        cycle: 'annual',
        snoozedUntil: '2026-10-01',
      }),
      new Date('2026-10-14T09:00:00Z'),
    );
    expect(w.state).toBe('open');
  });
});
