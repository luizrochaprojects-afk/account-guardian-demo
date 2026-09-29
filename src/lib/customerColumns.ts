// customerColumns — the Customer-phase columns of the accounts table view.
//
// WHY A REGISTRY. The accounts table wires each column by hand in five places:
// the `COLUMNS` catalog, the `tableDataColumns` order list, a `<TableCell>` in
// the body, the chip list in DisplayOptionsPopover and the CSV column list.
// Nothing ties those five together, so they drift.
//
// Ten more columns wired the same way would be fifty hand-edits with no
// compiler help. This file is the single list instead: every touchpoint reads
// it, so a column is added once. That diverges from the surrounding convention
// deliberately — the hand-chain is incidental generated-code shape, not a
// load-bearing decision.
//
// PURITY: no React, no I/O (the src/lib rule). Formatters return strings, and
// the table renders them.

import type { CustomerSignalRow } from '@/hooks/useCustomerSignals';
import { customerRiskReasonLabel, CHURN_REASON_LABELS } from '@/lib/pipelineStages';

/** Everything a formatter is allowed to look at. */
export interface CustomerCellContext {
  signals: CustomerSignalRow | undefined;
  /** From `accounts`, not the signals view — the human-declared churn reason. */
  churnReason: string | null;
  /** Currency symbol from org settings. */
  symbol: string;
  /** Source→display rate. `null` means "show the amount unconverted", never "show —". */
  fxRate: number | null;
}

export interface CustomerColumnDef {
  key: string;
  label: string;
  /** Width for the loading skeleton, matching the existing table convention. */
  skeletonWidth: string;
  /**
   * `null` renders as an em-dash. Returning `'0'` where the value is unknown is
   * the bug this whole feature exists to avoid, so formatters must not coerce.
   */
  format: (ctx: CustomerCellContext) => string | null;
  /** Unconverted source amount, for the tooltip. `null` when the cell is not a money value. */
  usdTooltip?: (ctx: CustomerCellContext) => number | null;
}

/** Signed, arrowed percent. Status is never carried by colour alone. */
const signedPct = (frac: number | null | undefined): string | null => {
  if (frac === null || frac === undefined) return null;
  const pct = Math.round(frac * 100);
  if (pct > 0) return `▲ +${pct}%`;
  if (pct < 0) return `▼ ${pct}%`;
  return '0%';
};

const shortDate = (iso: string | null | undefined): string | null =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

/** Mirrors the badge vocabulary in customerSignals.ts: 'partial' is an account
 *  with thin history, 'stale' is the usage sync running late. */
export const SIGNAL_QUALITY_LABELS: Record<string, string> = {
  full: 'Fresh',
  partial: 'Thin history',
  stale: 'Stale',
  none: 'None',
};

/**
 * The Customer-phase columns, in the order they read on screen: usage first,
 * then relationship, then data quality. All hidden by default — they are noise
 * outside the Customer phase.
 */
export const CUSTOMER_COLUMNS: CustomerColumnDef[] = [
  {
    key: 'usage4w',
    label: 'Usage 4w',
    skeletonWidth: 'w-16',
    format: (c) => (c.signals ? c.signals.usage4w.toLocaleString('en-US') : null),
  },
  {
    key: 'usageDelta',
    label: 'Δ 4w',
    skeletonWidth: 'w-14',
    // null means "no baseline", which is emphatically not a 0% change.
    format: (c) => signedPct(c.signals?.usageDeltaPct),
  },
  {
    key: 'lastUsage',
    label: 'Last usage',
    skeletonWidth: 'w-20',
    format: (c) => shortDate(c.signals?.lastUsageAt),
  },
  {
    key: 'cohort',
    label: 'Cohort',
    skeletonWidth: 'w-12',
    format: (c) => c.signals?.cohort ?? null,
  },
  {
    key: 'healthDelta30d',
    label: 'Health Δ30d',
    skeletonWidth: 'w-14',
    format: (c) => {
      const d = c.signals?.healthDelta30d;
      if (d === null || d === undefined) return null;
      return d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : '0';
    },
  },
  {
    key: 'lastActivityDays',
    label: 'Last activity (d)',
    skeletonWidth: 'w-14',
    format: (c) =>
      c.signals?.daysSinceLastActivity === null ||
      c.signals?.daysSinceLastActivity === undefined
        ? null
        : `${c.signals.daysSinceLastActivity}d`,
  },
  {
    key: 'riskReason',
    label: 'Risk reason',
    skeletonWidth: 'w-24',
    format: (c) =>
      c.signals?.customerRiskReason
        ? customerRiskReasonLabel(c.signals.customerRiskReason)
        : null,
  },
  {
    key: 'churnReason',
    label: 'Churn reason',
    skeletonWidth: 'w-24',
    // Reported separately from loss_reason_category: "did not buy" and
    // "bought and left" are different phenomena and averaging them helps nobody.
    format: (c) =>
      c.churnReason ? (CHURN_REASON_LABELS[c.churnReason] ?? c.churnReason) : null,
  },
  {
    key: 'signalQuality',
    label: 'Signal quality',
    skeletonWidth: 'w-16',
    // Shown so the board never quietly implies precision it does not have.
    format: (c) =>
      c.signals ? (SIGNAL_QUALITY_LABELS[c.signals.signalQuality] ?? c.signals.signalQuality) : null,
  },
];

export const CUSTOMER_COLUMN_KEYS: readonly string[] = CUSTOMER_COLUMNS.map((c) => c.key);

export const isCustomerColumn = (key: string): boolean =>
  CUSTOMER_COLUMN_KEYS.includes(key);

/** Renders a cell, collapsing every "not computable" case to one em-dash. */
export function formatCustomerCell(
  def: CustomerColumnDef,
  ctx: CustomerCellContext,
): string {
  return def.format(ctx) ?? '—';
}
