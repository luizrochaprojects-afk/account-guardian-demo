import { describe, it, expect } from 'vitest';
import {
  toIncumbentDraft,
  toIncumbentPatch,
  readIncumbentColumns,
  CLEARED_INCUMBENT_PATCH,
  snoozeIncumbentPatch,
  discardIncumbentPatch,
  isIncumbentWindowTask,
} from './incumbentAccount';

const NOW = new Date('2026-08-05T12:00:00Z');

describe('toIncumbentDraft', () => {
  it('reads the incumbent columns off an account row', () => {
    const draft = toIncumbentDraft({
      incumbent_vendor: 'Legacy CRM',
      incumbent_last_renewal: '2026-01-01',
      incumbent_cycle: 'annual',
      incumbent_evidence: 'we renew in January',
    });
    expect(draft).toEqual({
      vendor: 'Legacy CRM',
      lastRenewal: '2026-01-01',
      cycle: 'annual',
      evidence: 'we renew in January',
    });
  });

  it('falls back to an empty draft for an account that has never been asked', () => {
    expect(toIncumbentDraft({})).toEqual({
      vendor: null,
      lastRenewal: null,
      cycle: 'unknown',
      evidence: null,
    });
  });

  it('tolerates a null account', () => {
    expect(toIncumbentDraft(null).cycle).toBe('unknown');
  });
});

describe('readIncumbentColumns', () => {
  it('returns every column, defaulting the ones the row does not carry', () => {
    const cols = readIncumbentColumns({ incumbent_vendor: 'Legacy CRM' });
    expect(cols.incumbent_vendor).toBe('Legacy CRM');
    expect(cols.incumbent_cycle).toBe('unknown');
    expect(cols.incumbent_last_renewal).toBeNull();
    expect(cols.incumbent_window_snoozed_until).toBeNull();
    expect(cols.incumbent_window_disabled_reason).toBeNull();
  });

  it('survives a row selected before the columns existed', () => {
    // Query payloads elsewhere in the app omit these columns entirely.
    const cols = readIncumbentColumns({ id: 'a1', name: 'Farmacia X' });
    expect(cols.incumbent_cycle).toBe('unknown');
    expect(cols.incumbent_vendor).toBeNull();
  });
});

describe('toIncumbentPatch', () => {
  it('normalizes the vendor so aggregation later holds', () => {
    const patch = toIncumbentPatch(
      { vendor: ' legacy crm ', lastRenewal: '2026-01-01', cycle: 'annual', evidence: 'x' },
      'human',
      NOW,
    );
    expect(patch.incumbent_vendor).toBe('Legacy CRM');
  });

  it('stamps the source and the capture time', () => {
    const patch = toIncumbentPatch(
      { vendor: 'Legacy CRM', lastRenewal: null, cycle: 'unknown', evidence: null },
      'agent',
      NOW,
    );
    expect(patch.incumbent_source).toBe('agent');
    expect(patch.incumbent_captured_at).toBe(NOW.toISOString());
  });

  it('collapses blank evidence to null rather than an empty string', () => {
    const patch = toIncumbentPatch(
      { vendor: 'Legacy CRM', lastRenewal: null, cycle: 'unknown', evidence: '   ' },
      'human',
      NOW,
    );
    expect(patch.incumbent_evidence).toBeNull();
  });

  it('normalizes the anchor to the first of the month', () => {
    const patch = toIncumbentPatch(
      { vendor: 'Legacy CRM', lastRenewal: '2026-01-23', cycle: 'annual', evidence: null },
      'human',
      NOW,
    );
    expect(patch.incumbent_last_renewal).toBe('2026-01-01');
  });

  it('pairs with an explicit clear patch, since an empty draft yields nothing to write', () => {
    // Wiping the block must actually wipe the row. toIncumbentPatch cannot know
    // that on its own, so the erase path is a separate, named patch.
    expect(CLEARED_INCUMBENT_PATCH.incumbent_vendor).toBeNull();
    expect(CLEARED_INCUMBENT_PATCH.incumbent_cycle).toBe('unknown');
    expect(CLEARED_INCUMBENT_PATCH.incumbent_source).toBeNull();
    expect(CLEARED_INCUMBENT_PATCH.incumbent_captured_at).toBeNull();
  });

  it('leaves no source or timestamp when the draft is entirely empty', () => {
    // Opening a modal and closing it must not stamp an account as "asked".
    const patch = toIncumbentPatch(
      { vendor: null, lastRenewal: null, cycle: 'unknown', evidence: null },
      'human',
      NOW,
    );
    expect(patch).toEqual({});
  });
});

describe('isIncumbentWindowTask', () => {
  it('recognizes the tag the nightly gate stamps', () => {
    expect(isIncumbentWindowTask(['incumbent-window', 'incumbent-window:2027-01-01'])).toBe(true);
  });

  it('ignores unrelated tasks', () => {
    expect(isIncumbentWindowTask(['renewal'])).toBe(false);
    expect(isIncumbentWindowTask([])).toBe(false);
    expect(isIncumbentWindowTask(null)).toBe(false);
  });

  it('does not match on the cycle-specific tag alone', () => {
    // The bare tag is what marks the kind; the dated one is the idempotency key.
    expect(isIncumbentWindowTask(['incumbent-window:2027-01-01'])).toBe(false);
  });
});

describe('snoozeIncumbentPatch', () => {
  it('pushes the window out by the requested number of days', () => {
    expect(snoozeIncumbentPatch(30, NOW).incumbent_window_snoozed_until).toBe('2026-09-04');
  });

  it('crosses a month boundary correctly', () => {
    expect(snoozeIncumbentPatch(90, NOW).incumbent_window_snoozed_until).toBe('2026-11-03');
  });

  it('touches nothing but the snooze', () => {
    expect(Object.keys(snoozeIncumbentPatch(30, NOW))).toEqual([
      'incumbent_window_snoozed_until',
    ]);
  });
});

describe('discardIncumbentPatch', () => {
  it('records the reason, which is what stops it reappearing next cycle', () => {
    expect(discardIncumbentPatch('  moved off CRM entirely ')).toEqual({
      incumbent_window_disabled_reason: 'moved off CRM entirely',
    });
  });

  it('refuses a blank reason', () => {
    expect(() => discardIncumbentPatch('   ')).toThrow(/reason/i);
  });
});
