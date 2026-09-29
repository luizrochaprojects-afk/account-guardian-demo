import { describe, it, expect } from 'vitest';
import {
  CUSTOMER_COLUMNS,
  CUSTOMER_COLUMN_KEYS,
  formatCustomerCell,
  isCustomerColumn,
  type CustomerCellContext,
} from './customerColumns';
import type { CustomerSignalRow } from '@/hooks/useCustomerSignals';

const signals = (over: Partial<CustomerSignalRow> = {}): CustomerSignalRow => ({
  accountId: 'a',
  pipelineStage: 'steady',
  customerSince: null,
  firstUsageAt: '2025-01-01T12:00:00Z',
  // Midday UTC so the en-US date reads the same in every local timezone.
  lastUsageAt: '2026-07-27T12:00:00Z',
  reactivatedAt: null,
  customerStagePinnedAt: null,
  usage4w: 4000,
  usagePrev4w: 4000,
  usageDeltaPct: 0,
  weeksSinceLastUsage: 0,
  daysSinceLastActivity: 3,
  healthScore: 80,
  healthLoggedAt: '2026-08-01T00:00:00Z',
  cohort: 'M1+',
  signalQuality: 'full',
  healthDelta30d: 5,
  customerRiskReason: null,
  ...over,
});

const ctx = (over: Partial<CustomerCellContext> = {}): CustomerCellContext => ({
  signals: signals(),
  churnReason: null,
  symbol: '$',
  fxRate: null,
  ...over,
});

const cell = (key: string, c: CustomerCellContext) => {
  const def = CUSTOMER_COLUMNS.find((d) => d.key === key)!;
  return formatCustomerCell(def, c);
};

describe('CUSTOMER_COLUMNS registry', () => {
  it('exposes the customer-phase columns in reading order: usage, relationship, data quality', () => {
    expect(CUSTOMER_COLUMN_KEYS).toEqual([
      'usage4w',
      'usageDelta',
      'lastUsage',
      'cohort',
      'healthDelta30d',
      'lastActivityDays',
      'riskReason',
      'churnReason',
      'signalQuality',
    ]);
  });

  it('has unique keys — a duplicate would silently drop a column from the table', () => {
    expect(new Set(CUSTOMER_COLUMN_KEYS).size).toBe(CUSTOMER_COLUMN_KEYS.length);
  });

  it('gives every column a label and a skeleton width', () => {
    for (const def of CUSTOMER_COLUMNS) {
      expect(def.label.length, def.key).toBeGreaterThan(0);
      expect(def.skeletonWidth, def.key).toMatch(/^w-/);
    }
  });

  it('recognises its own keys and nothing else', () => {
    expect(isCustomerColumn('usage4w')).toBe(true);
    expect(isCustomerColumn('segment')).toBe(false);
  });

  it('renders every column as an em-dash for an account with no signals row', () => {
    const empty = ctx({ signals: undefined });
    for (const def of CUSTOMER_COLUMNS) {
      expect(formatCustomerCell(def, empty)).toBe('—');
    }
  });
});

describe('formatters', () => {
  it('formats usage as a plain en-US count — it is units, not money', () => {
    expect(cell('usage4w', ctx())).toBe('4,000');
    expect(cell('usage4w', ctx({ signals: signals({ usage4w: 1_234_567 }) }))).toBe('1,234,567');
  });

  it('shows zero usage as zero — that is a fact, not a gap', () => {
    expect(cell('usage4w', ctx({ signals: signals({ usage4w: 0 }) }))).toBe('0');
  });

  it('carries arrow, sign and number on the delta — never colour alone', () => {
    expect(cell('usageDelta', ctx({ signals: signals({ usageDeltaPct: 0.34 }) }))).toBe('▲ +34%');
    expect(cell('usageDelta', ctx({ signals: signals({ usageDeltaPct: -0.22 }) }))).toBe('▼ -22%');
  });

  it('shows an em-dash, not 0%, when there is no baseline to compare against', () => {
    expect(cell('usageDelta', ctx({ signals: signals({ usageDeltaPct: null }) }))).toBe('—');
  });

  it('distinguishes a real flat month from a missing one', () => {
    expect(cell('usageDelta', ctx({ signals: signals({ usageDeltaPct: 0 }) }))).toBe('0%');
  });

  it('formats the last usage date in en-US', () => {
    expect(cell('lastUsage', ctx())).toBe('Jul 27, 2026');
    expect(cell('lastUsage', ctx({ signals: signals({ lastUsageAt: null }) }))).toBe('—');
  });

  it('shows the cohort, or a dash when it is not computable', () => {
    expect(cell('cohort', ctx())).toBe('M1+');
    expect(cell('cohort', ctx({ signals: signals({ cohort: null }) }))).toBe('—');
  });

  it('shows days since last activity, keeping a same-day touch as 0d', () => {
    expect(cell('lastActivityDays', ctx())).toBe('3d');
    expect(cell('lastActivityDays', ctx({ signals: signals({ daysSinceLastActivity: 0 }) }))).toBe('0d');
    expect(cell('lastActivityDays', ctx({ signals: signals({ daysSinceLastActivity: null }) }))).toBe('—');
  });

  it('labels the risk reason in words, not as an enum key', () => {
    expect(cell('riskReason', ctx({ signals: signals({ customerRiskReason: 'no_usage' }) })))
      .toBe('No usage for 2+ weeks');
    expect(cell('riskReason', ctx({ signals: signals({ customerRiskReason: 'contracting' }) })))
      .toBe('Usage falling');
    expect(cell('riskReason', ctx())).toBe('—');
  });

  it('reads churn reason off the account, not the signals view', () => {
    expect(cell('churnReason', ctx({ churnReason: 'price' }))).not.toBe('—');
    expect(cell('churnReason', ctx())).toBe('—');
  });

  it('spells out signal quality so stale data is visible rather than implied', () => {
    expect(cell('signalQuality', ctx())).toBe('Fresh');
    expect(cell('signalQuality', ctx({ signals: signals({ signalQuality: 'stale' }) }))).toBe('Stale');
    expect(cell('signalQuality', ctx({ signals: signals({ signalQuality: 'none' }) }))).toBe('None');
  });

  it('keeps thin history distinct from a late sync, as the badges do', () => {
    const partial = cell('signalQuality', ctx({ signals: signals({ signalQuality: 'partial' }) }));
    expect(partial).toBe('Thin history');
    expect(partial).not.toBe(cell('signalQuality', ctx({ signals: signals({ signalQuality: 'stale' }) })));
  });

  it('signs the health delta both ways', () => {
    expect(cell('healthDelta30d', ctx({ signals: signals({ healthDelta30d: 7 }) }))).toBe('▲ +7');
    expect(cell('healthDelta30d', ctx({ signals: signals({ healthDelta30d: -12 }) }))).toBe('▼ -12');
    expect(cell('healthDelta30d', ctx({ signals: signals({ healthDelta30d: 0 }) }))).toBe('0');
    expect(cell('healthDelta30d', ctx({ signals: signals({ healthDelta30d: null }) }))).toBe('—');
  });

  it('exposes no money tooltip — none of the customer columns is a money value', () => {
    for (const def of CUSTOMER_COLUMNS) {
      expect(def.usdTooltip, def.key).toBeUndefined();
    }
  });
});
