import { describe, it, expect } from 'vitest';
import {
  PIPELINE_CARD_FIELDS,
  defaultFieldsForPhase,
  fieldsForPhase,
  isFieldVisible,
  type CardFieldKey,
} from './pipelineCardFields';
import { PIPELINE_PHASES } from './pipelinePhases';

const ALL_PHASES = PIPELINE_PHASES.map((p) => p.phase);

describe('PIPELINE_CARD_FIELDS', () => {
  it('has no duplicate keys', () => {
    const keys = PIPELINE_CARD_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('marks exactly one field as required', () => {
    expect(PIPELINE_CARD_FIELDS.filter((f) => f.required).map((f) => f.key)).toEqual(['name']);
  });

  it('only scopes fields to phases that exist', () => {
    for (const f of PIPELINE_CARD_FIELDS) {
      for (const p of f.phases ?? []) expect(ALL_PHASES).toContain(p);
    }
  });
});

describe('fieldsForPhase', () => {
  it('keeps pre-close money out of the customer phase', () => {
    const keys = fieldsForPhase('customer').map((f) => f.key);
    expect(keys).not.toContain('potentialArr');
    expect(keys).not.toContain('confidence');
    expect(keys).not.toContain('expectedClose');
  });

  it('keeps customer signals out of the pre-close phases', () => {
    for (const phase of ['sdr', 'sales', 'onboarding'] as const) {
      const keys = fieldsForPhase(phase).map((f) => f.key);
      expect(keys).not.toContain('usage');
      expect(keys).not.toContain('usageDelta');
      expect(keys).not.toContain('riskReason');
      expect(keys).not.toContain('customerBadges');
    }
  });

  it('offers the usage fields only in the customer phase', () => {
    const customer = fieldsForPhase('customer').map((f) => f.key);
    expect(customer).toContain('usage');
    expect(customer).toContain('usageDelta');
    for (const phase of ['sdr', 'sales', 'onboarding'] as const) {
      const keys = fieldsForPhase(phase).map((f) => f.key);
      expect(keys).not.toContain('usage');
      expect(keys).not.toContain('usageDelta');
    }
  });

  it('no longer catalogues the retired money and coverage fields', () => {
    const keys = PIPELINE_CARD_FIELDS.map((f) => f.key as string);
    for (const retired of ['legacyValue', 'legacyDelta', 'coverage', 'dealCoverage']) {
      expect(keys).not.toContain(retired);
    }
  });

  it('preserves registry order, which is also render order', () => {
    const keys = fieldsForPhase('sdr').map((f) => f.key);
    expect(keys.indexOf('segment')).toBeLessThan(keys.indexOf('industry'));
    expect(keys.indexOf('industry')).toBeLessThan(keys.indexOf('plan'));
    expect(keys.indexOf('plan')).toBeLessThan(keys.indexOf('region'));
    expect(keys.indexOf('nextStepDue')).toBeLessThan(keys.indexOf('lastContact'));
  });
});

describe('defaultFieldsForPhase', () => {
  // Anchor test: these sets ARE the card as it rendered before the registry
  // existed. A refactor that silently changes what a card shows breaks here.
  it('matches the pre-registry card for the pre-close phases', () => {
    expect(defaultFieldsForPhase('sdr')).toEqual([
      'name', 'health', 'segment', 'industry', 'source', 'revenueOwner', 'daysInStage',
      'potentialArr', 'confidence', 'nextStepDue', 'lastContact',
    ]);
    expect(defaultFieldsForPhase('sales')).toEqual([
      'name', 'health', 'segment', 'industry', 'source', 'revenueOwner', 'daysInStage',
      'potentialArr', 'confidence', 'nextStepDue', 'lastContact',
    ]);
  });

  it('matches the pre-registry card for the customer phase', () => {
    expect(defaultFieldsForPhase('customer')).toEqual([
      'name', 'health', 'segment', 'industry', 'source', 'revenueOwner', 'daysInStage',
      'usage', 'usageDelta', 'riskReason', 'customerBadges',
      'nextStepDue', 'lastContact',
    ]);
  });

  it('ships every newly catalogued field off by default', () => {
    const off: CardFieldKey[] = [
      'plan', 'region', 'tags', 'deliveryOwner', 'expectedClose',
      'nextStep', 'mrrArr', 'customerSince',
    ];
    for (const phase of ALL_PHASES) {
      const defaults = defaultFieldsForPhase(phase);
      for (const key of off) expect(defaults).not.toContain(key);
    }
  });

  it('always includes the required field', () => {
    for (const phase of ALL_PHASES) {
      expect(defaultFieldsForPhase(phase)).toContain('name');
    }
  });
});

describe('isFieldVisible', () => {
  it('shows a required field even against an empty set', () => {
    expect(isFieldVisible('name', 'sdr', new Set())).toBe(true);
  });

  it('falls back to the defaults when there is no stored set', () => {
    expect(isFieldVisible('daysInStage', 'sdr', null)).toBe(true);
    expect(isFieldVisible('tags', 'sdr', null)).toBe(false);
  });

  it('lets the stored set turn a default-on field off and a default-off field on', () => {
    expect(isFieldVisible('daysInStage', 'sdr', new Set(['name']))).toBe(false);
    expect(isFieldVisible('tags', 'sdr', new Set(['tags']))).toBe(true);
  });

  it('hides a field outside its phase even when the set asks for it', () => {
    expect(isFieldVisible('usage', 'sdr', new Set(['usage']))).toBe(false);
    expect(isFieldVisible('potentialArr', 'customer', new Set(['potentialArr']))).toBe(false);
  });

  it('honours the pre-rename key so a customised board keeps showing ARR', () => {
    // `expectedArr` is what boards customised before the expected_arr retirement
    // have in localStorage; dropping it would read as "my ARR disappeared".
    expect(isFieldVisible('potentialArr', 'sales', new Set(['expectedArr']))).toBe(true);
    expect(isFieldVisible('potentialArr', 'sales', new Set(['name']))).toBe(false);
  });

  it('honours the pre-split owner key for the revenue marker only', () => {
    // `owner` is what older boards have in localStorage from before the
    // account owner was split in two. Dropping it would read as "the unassigned
    // marker disappeared", not as a rename. The delivery marker is genuinely
    // new, so it stays off until someone asks for it.
    expect(isFieldVisible('revenueOwner', 'sales', new Set(['owner']))).toBe(true);
    expect(isFieldVisible('deliveryOwner', 'sales', new Set(['owner']))).toBe(false);
    expect(isFieldVisible('revenueOwner', 'sales', new Set(['name']))).toBe(false);
  });

  it('ignores the retired accountExecutive key left in a stored set', () => {
    // Retired outright with no successor — rule 1 already hides unknown keys,
    // so a stale stored set carrying it is inert rather than an error.
    expect(isFieldVisible('accountExecutive' as CardFieldKey, 'sdr', new Set(['accountExecutive']))).toBe(false);
  });

  it('hides an unknown key rather than throwing', () => {
    expect(isFieldVisible('nope' as CardFieldKey, 'sdr', new Set(['nope']))).toBe(false);
  });

  it('agrees with defaultFieldsForPhase for every field and phase', () => {
    for (const phase of ALL_PHASES) {
      const defaults = new Set(defaultFieldsForPhase(phase));
      for (const f of PIPELINE_CARD_FIELDS) {
        expect(isFieldVisible(f.key, phase, null)).toBe(defaults.has(f.key));
      }
    }
  });
});
