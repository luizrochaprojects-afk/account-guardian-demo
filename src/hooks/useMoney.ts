import { useMemo } from 'react';
import { useOrgSettings } from '@/hooks/useOrgSettings';
import { formatCurrencyValue, formatCurrencyCompact } from '@/lib/currency';

/**
 * One money formatter for the whole dashboard.
 *
 * WHY ONE: with several formatters, the currency a user saw depends on which
 * component rendered the figure — two numbers on the same screen can carry
 * different prefixes with nothing else to say which is which.
 *
 * THE POLICY: display currency comes from org_settings, always.
 *
 * Components call this hook directly rather than taking an `fmt` prop. That
 * removed seven prop-drills and, more importantly, made it impossible for two
 * components on the same screen to format differently.
 */
export interface Money {
  /** Org currency symbol, e.g. `$` or `R$`. */
  symbol: string;
  /** Org currency code, e.g. `USD` or `BRL`. */
  code: string;
  /** Format a figure already in the org's currency. */
  money: (n: number | string | null | undefined) => string;
  /** Compact form for chart axes and dense tiles: `$1.2k`. */
  moneyCompact: (n: number | string | null | undefined) => string;
}

export function useMoney(): Money {
  const { currencySymbol, currencyCode } = useOrgSettings();

  return useMemo(() => {
    return {
      symbol: currencySymbol,
      code: currencyCode,
      money: (n) => formatCurrencyValue(n, currencySymbol, currencyCode),
      moneyCompact: (n) => formatCurrencyCompact(n, currencySymbol),
    };
  }, [currencySymbol, currencyCode]);
}
