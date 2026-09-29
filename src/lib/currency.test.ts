import { describe, it, expect } from 'vitest';
import { formatCurrencyValue, formatCurrencyCompact } from './currency';

describe('formatCurrencyValue', () => {
  it('uses the org symbol and thousands separators', () => {
    expect(formatCurrencyValue(1000, '$')).toBe('$1,000');
    expect(formatCurrencyValue(1234.5, '$')).toBe('$1,234.5');
  });

  it('renders an em dash for missing values', () => {
    expect(formatCurrencyValue(null, '$')).toBe('—');
    expect(formatCurrencyValue(undefined, '$')).toBe('—');
    expect(formatCurrencyValue('', '$')).toBe('—');
  });

  it('caps at cents — money has no third decimal place', () => {
    // toLocaleString's default maximumFractionDigits is 3, which would render a
    // converted figure with a third decimal place.
    expect(formatCurrencyValue(1234.5678, '$')).toBe('$1,234.57');
    expect(formatCurrencyValue(1000.125, '$')).toBe('$1,000.13');
    // No minimum, so round figures stay clean instead of gaining ".00".
    expect(formatCurrencyValue(50000, '$')).toBe('$50,000');
  });

  it('uses pt-BR grouping for BRL when the currency code is passed, not an en-US comma', () => {
    expect(formatCurrencyValue(50000, 'R$', 'BRL')).toBe('R$ 50.000');
    // Without a code, the caller gets the old default — this is what a caller
    // that hasn't been updated to pass currencyCode still sees.
    expect(formatCurrencyValue(50000, 'R$')).toBe('R$ 50,000');
  });
});

describe('formatCurrencyCompact — chart axes', () => {
  it('abbreviates by magnitude', () => {
    expect(formatCurrencyCompact(1234, '$')).toBe('$1.2k');
    expect(formatCurrencyCompact(12_345, '$')).toBe('$12k');
    expect(formatCurrencyCompact(3_400_000, '$')).toBe('$3.4M');
    expect(formatCurrencyCompact(2_500_000_000, '$')).toBe('$2.5B');
  });

  it('leaves sub-thousand values whole', () => {
    expect(formatCurrencyCompact(0, '$')).toBe('$0');
    expect(formatCurrencyCompact(999, '$')).toBe('$999');
  });

  it('keeps every label short enough for a narrow axis', () => {
    for (const n of [1234, 12_345, 123_456, 1_234_567, 12_345_678]) {
      expect(formatCurrencyCompact(n, '$').length).toBeLessThanOrEqual(7);
    }
  });

  it('handles negatives', () => {
    expect(formatCurrencyCompact(-1500, '$')).toBe('-$1.5k');
  });

  // 'R$' contains a letter, so it takes the space — same rule formatCurrencyValue
  // applies. The two formatters must agree or a tile and its axis look mismatched.
  it('spaces letter-bearing symbols exactly like formatCurrencyValue', () => {
    expect(formatCurrencyCompact(1500, 'CHF')).toBe('CHF 1.5k');
    expect(formatCurrencyCompact(1500, 'R$')).toBe('R$ 1.5k');
    expect(formatCurrencyValue(1500, 'R$')).toBe('R$ 1,500');
  });

  it('renders an em dash for missing values', () => {
    expect(formatCurrencyCompact(null, '$')).toBe('—');
    expect(formatCurrencyCompact(undefined, '$')).toBe('—');
  });
});
