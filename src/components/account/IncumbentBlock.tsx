import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';
import { PropertyField } from '@/components/properties/PropertyField';
import type { CustomProperty } from '@/hooks/useCustomProperties';
import {
  computeIncumbentWindow,
  normalizeVendor,
  KNOWN_INCUMBENT_VENDORS,
  type IncumbentCycle,
  type IncumbentDraft,
} from '@/lib/incumbentWindow';

export type { IncumbentDraft };

/**
 * Capture surface for the incumbent and its renewal anchor, reused verbatim in
 * the three places the information actually shows up: the `does_crm_today`
 * qualification item, the Sales motion tab, and the exit-reason modal.
 *
 * It takes a value and an onChange rather than an Account so the exit-reason
 * modal can collect a draft before anything is written, and so the pure
 * formatting below stays testable without a database.
 */

const CYCLE_LABEL: Record<IncumbentCycle, string> = {
  annual: 'Annual',
  biennial: 'Every 2 years',
  monthly: 'Monthly',
  unknown: "Don't know",
};

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Synthetic property descriptors — deliberately NOT rows in `custom_properties`.
 * The four fields are typed columns on `accounts` (two of them Postgres enums,
 * one a real `date`) because `run_incumbent_window_gate()` does date arithmetic
 * over them on the nightly cron, which a jsonb EAV value cannot carry safely.
 * The descriptors exist only so capture renders through the same PropertyField
 * as every other field in the app, instead of a hand-rolled form that drifts.
 */
function descriptor(
  key: string,
  label: string,
  type: CustomProperty['type'],
  extra: Partial<CustomProperty> = {},
): CustomProperty {
  return {
    id: key,
    organization_id: '',
    entity_type: 'account',
    key,
    label,
    type,
    options: [],
    description: null,
    is_required: false,
    is_system: true,
    show_in_create: false,
    default_value: null,
    position: 0,
    created_at: '',
    updated_at: '',
    ...extra,
  };
}

/* Free text over a datalist rather than a closed select: the vendor landscape
   shifts faster than a migration cadence, and a rep blocked by a missing
   option types nothing at all. */
const VENDOR_PROP = descriptor('incumbent_vendor', 'Incumbent', 'text', {
  options: [...KNOWN_INCUMBENT_VENDORS],
  description: 'Legacy CRM, in-house tool, ...',
});

/* Month precision by construction. A prospect says "we renew in January",
   never a date, and a field that demands a date stays empty. */
const ANCHOR_PROP = descriptor('incumbent_last_renewal', 'Last renewal', 'month');

const CYCLE_PROP = descriptor('incumbent_cycle', 'Contract cycle', 'select', {
  options: Object.keys(CYCLE_LABEL),
  option_labels: CYCLE_LABEL,
});

const EVIDENCE_PROP = descriptor('incumbent_evidence', 'Evidence', 'long_text', {
  description: 'What they actually said, in their words',
});

/**
 * Format straight off the ISO string. `new Date('2026-10-03')` is UTC midnight,
 * so any local-time formatter renders 2 Oct for the whole team's timezone.
 */
function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

function formatIsoMonth(iso: string): string {
  const [y, m] = iso.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/**
 * Turn the draft into the one line that tells a rep whether the inference is
 * right. Showing the derived window at capture time is what keeps the
 * anchor-plus-cycle model from feeling like a black box.
 */
export function describeIncumbentWindow(
  value: IncumbentDraft,
  now: Date,
  leadDays?: number,
) {
  const window = computeIncumbentWindow(
    { lastRenewal: value.lastRenewal, cycle: value.cycle },
    now,
    leadDays,
  );

  // Only nag once a vendor exists. Before that the block is simply empty, and
  // an empty block does not need a warning.
  const warning =
    value.vendor?.trim() && !value.evidence?.trim()
      ? 'No evidence recorded. The task can fire a full cycle from now, and it will say the evidence is missing.'
      : null;

  if (!window.nextRenewalEstimate || !window.opensAt) {
    return {
      window,
      warning,
      summary:
        'Renewal window not computable yet. Add the anchor month and the contract cycle.',
    };
  }

  const renewal = formatIsoMonth(window.nextRenewalEstimate);
  const opens = formatIsoDate(window.opensAt);
  const days = window.daysUntilOpen ?? 0;

  return {
    window,
    warning,
    summary:
      days > 0
        ? `Next renewal ${renewal}. Window opens ${opens}, in ${days} days.`
        : `Next renewal ${renewal}. Window has been open since ${opens} (${Math.abs(days)} days).`,
  };
}

interface Props {
  value: IncumbentDraft;
  onChange: (next: IncumbentDraft) => void;
  /** Injected so the summary is deterministic in tests. */
  now?: Date;
  leadDays?: number;
  /** Field id prefix, needed when two blocks share a page. */
  idPrefix?: string;
}

export function IncumbentBlock({
  value,
  onChange,
  now = new Date(),
  leadDays,
  idPrefix = 'incumbent',
}: Props) {
  const { summary, warning } = describeIncumbentWindow(value, now, leadDays);
  const patch = (over: Partial<IncumbentDraft>) => onChange({ ...value, ...over });

  const field = (prop: CustomProperty, node: ReactNode) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-${prop.key}`} className="text-xs">{prop.label}</Label>
      {node}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {field(
          VENDOR_PROP,
          <PropertyField
            property={VENDOR_PROP}
            id={`${idPrefix}-${VENDOR_PROP.key}`}
            size="sm"
            value={value.vendor ?? ''}
            onChange={(v) => patch({ vendor: v || null })}
            onBlur={(v) => patch({ vendor: normalizeVendor(v ?? '') })}
          />,
        )}

        {field(
          ANCHOR_PROP,
          <PropertyField
            property={ANCHOR_PROP}
            id={`${idPrefix}-${ANCHOR_PROP.key}`}
            size="sm"
            value={value.lastRenewal}
            onChange={(v) => patch({ lastRenewal: v })}
          />,
        )}

        {field(
          CYCLE_PROP,
          <PropertyField
            property={CYCLE_PROP}
            id={`${idPrefix}-${CYCLE_PROP.key}`}
            size="sm"
            value={value.cycle}
            // The column is a non-null enum, so an empty selection is 'unknown',
            // never null.
            onChange={(v) => patch({ cycle: (v as IncumbentCycle) ?? 'unknown' })}
          />,
        )}
      </div>

      {field(
        EVIDENCE_PROP,
        <PropertyField
          property={EVIDENCE_PROP}
          id={`${idPrefix}-${EVIDENCE_PROP.key}`}
          size="sm"
          value={value.evidence ?? ''}
          onChange={(v) => patch({ evidence: v || null })}
        />,
      )}

      <p className="text-[11px] text-muted-foreground">{summary}</p>

      {warning && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-500">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{warning}</span>
        </p>
      )}
    </div>
  );
}
