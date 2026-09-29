export interface CurrencyPreset {
  code: string;
  symbol: string;
  label: string;
}

export const CURRENCY_PRESETS: CurrencyPreset[] = [
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "BRL", symbol: "R$", label: "Brazilian Real" },
  { code: "CAD", symbol: "$", label: "Canadian Dollar" },
  { code: "AUD", symbol: "$", label: "Australian Dollar" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen" },
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "MXN", symbol: "$", label: "Mexican Peso" },
  { code: "CHF", symbol: "CHF", label: "Swiss Franc" },
];

export interface CurrencySettings {
  currencyCode: string;
  currencySymbol: string;
}

export const DEFAULT_CURRENCY: CurrencySettings = {
  currencyCode: "USD",
  currencySymbol: "$",
};

/**
 * Number-grouping locale per currency code — NOT the org's content locale,
 * just which separators a number in this currency reads correctly with.
 * Defaults to en-US (comma thousands) for any code not listed. Without this,
 * a BRL amount rendered "R$ 50,000" mixes a Portuguese-market symbol with an
 * English-market separator, which reads as fifty (not fifty thousand) to a
 * pt-BR reader.
 */
const CURRENCY_GROUPING_LOCALE: Record<string, string> = {
  BRL: "pt-BR",
};

/**
 * Format a numeric value as currency using the org's chosen symbol.
 * Falls back to "$" if the symbol is empty (settings still loading). Pass
 * `currencyCode` (from `useOrgSettings()`) so the thousands/decimal
 * separators match the currency, not just the symbol.
 */
export function formatCurrencyValue(
  amount: number | string | null | undefined,
  symbol: string = DEFAULT_CURRENCY.currencySymbol,
  currencyCode?: string,
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = typeof amount === "number" ? amount : Number(amount);
  if (Number.isNaN(n)) return "—";
  const sym = symbol || DEFAULT_CURRENCY.currencySymbol;
  // Symbols with letters (CHF, kr, etc.) render nicer with a space.
  const needsSpace = /[A-Za-z]/.test(sym);
  const locale = CURRENCY_GROUPING_LOCALE[currencyCode ?? ""] ?? "en-US";
  // Cap at cents. `toLocaleString` defaults to maximumFractionDigits: 3, which
  // renders a converted figure as "$1,234.567" — a third decimal place money
  // does not have. No minimum, so a round figure stays "$50,000" instead of
  // gaining a noisy ".00" on every tile.
  return `${sym}${needsSpace ? " " : ""}${n.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
}

/**
 * Compact currency for chart axes and dense tiles: `$1.2k`, `$3.4M`.
 *
 * A y-axis tick 70px wide cannot hold `$1,234,567`, which is what
 * formatCurrencyValue produces — the label gets clipped or the chart loses width
 * to the axis. Use this only where space forces it; precision belongs in the
 * tooltip.
 */
export function formatCurrencyCompact(
  amount: number | string | null | undefined,
  symbol: string = DEFAULT_CURRENCY.currencySymbol,
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = typeof amount === "number" ? amount : Number(amount);
  if (Number.isNaN(n)) return "—";
  const sym = symbol || DEFAULT_CURRENCY.currencySymbol;
  const space = /[A-Za-z]/.test(sym) ? " " : "";

  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const fmt = (v: number, suffix: string) => {
    // One decimal below 10 (1.2k), none above (12k) — keeps every label ≤ 6 chars.
    const rounded = abs < 10 * (suffix === "k" ? 1e3 : suffix === "M" ? 1e6 : 1e9)
      ? Math.round(v * 10) / 10
      : Math.round(v);
    return `${sign}${sym}${space}${rounded}${suffix}`;
  };

  if (abs >= 1e9) return fmt(abs / 1e9, "B");
  if (abs >= 1e6) return fmt(abs / 1e6, "M");
  if (abs >= 1e3) return fmt(abs / 1e3, "k");
  return `${sign}${sym}${space}${Math.round(abs)}`;
}
