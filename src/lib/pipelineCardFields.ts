import type { PipelinePhase } from './transitionStage';

/**
 * Every variable the pipeline card can render, as data.
 *
 * The card used to hardcode its field set in JSX, so changing what a card shows
 * meant editing the component. This registry is the single place a field is
 * declared; `PipelineCard` reads it, `PipelineCardFieldsMenu` builds its
 * checkbox list from it, and the two can never disagree about what exists.
 *
 * Pure on purpose (the `src/lib` rule): the visibility rules are the part
 * worth testing, and they should not need jsdom to test.
 */
export type CardFieldKey =
  | 'name'
  | 'health'
  // Attribute line — rendered joined by ' · ' in registry order.
  | 'segment'
  | 'industry'
  | 'plan'
  | 'region'
  | 'source'
  | 'tags'
  | 'revenueOwner'
  | 'deliveryOwner'
  | 'daysInStage'
  // Pre-close money. Meaningless once the deal is won: see the note in
  // PipelineCard about potential ARR on a live account.
  | 'potentialArr'
  | 'confidence'
  | 'expectedClose'
  // Customer phase — all sourced from `useCustomerSignals`, not the account row.
  | 'usage'
  | 'usageDelta'
  | 'riskReason'
  | 'customerBadges'
  // Date line — also joined by ' · ' in registry order.
  | 'nextStep'
  | 'nextStepDue'
  | 'lastContact'
  | 'mrrArr'
  | 'customerSince';

export interface CardFieldDef {
  key: CardFieldKey;
  /** Shown in the Card fields menu. */
  label: string;
  /** Always rendered; appears checked-and-disabled in the menu. */
  required?: boolean;
  /** Phases where the field carries meaning. Omitted = every phase. */
  phases?: readonly PipelinePhase[];
  /** Part of the default set for the phases it applies to. */
  defaultVisible: boolean;
}

const PRE_CLOSE: readonly PipelinePhase[] = ['sdr', 'sales', 'onboarding'];
const CUSTOMER: readonly PipelinePhase[] = ['customer'];

/**
 * Order matters twice: it is the order of the checkboxes in the menu AND the
 * order the parts of the composed lines (attributes, dates) are joined in.
 *
 * `defaultVisible` reproduces the card exactly as it rendered before this
 * registry existed — the fields added here that were never on the card ship
 * OFF, so nobody's board changes until they opt in.
 */
export const PIPELINE_CARD_FIELDS: readonly CardFieldDef[] = [
  { key: 'name', label: 'Name', required: true, defaultVisible: true },
  { key: 'health', label: 'Health score', defaultVisible: true },

  { key: 'segment', label: 'Segment', defaultVisible: true },
  { key: 'industry', label: 'Industry', defaultVisible: true },
  { key: 'plan', label: 'Plan', defaultVisible: false },
  { key: 'region', label: 'Region', defaultVisible: false },

  { key: 'source', label: 'Source', defaultVisible: true },
  { key: 'tags', label: 'Tags', defaultVisible: false },

  { key: 'revenueOwner', label: 'Revenue owner unassigned', defaultVisible: true },
  { key: 'deliveryOwner', label: 'Delivery owner unassigned', defaultVisible: false },
  { key: 'daysInStage', label: 'Days in stage', defaultVisible: true },

  { key: 'potentialArr', label: 'Potential ARR', phases: PRE_CLOSE, defaultVisible: true },
  { key: 'confidence', label: 'Founder confidence', phases: PRE_CLOSE, defaultVisible: true },
  { key: 'expectedClose', label: 'Expected close', phases: PRE_CLOSE, defaultVisible: false },

  { key: 'usage', label: 'Usage (4 weeks)', phases: CUSTOMER, defaultVisible: true },
  { key: 'usageDelta', label: 'Usage delta', phases: CUSTOMER, defaultVisible: true },
  { key: 'riskReason', label: 'Risk reason', phases: CUSTOMER, defaultVisible: true },
  { key: 'customerBadges', label: 'Signal badges', phases: CUSTOMER, defaultVisible: true },

  { key: 'nextStep', label: 'Next step', defaultVisible: false },
  { key: 'nextStepDue', label: 'Next step due', defaultVisible: true },
  { key: 'lastContact', label: 'Last contact', defaultVisible: true },

  { key: 'mrrArr', label: 'MRR / ARR', defaultVisible: false },
  { key: 'customerSince', label: 'Customer since', defaultVisible: false },
];

const BY_KEY = new Map<CardFieldKey, CardFieldDef>(
  PIPELINE_CARD_FIELDS.map((f) => [f.key, f]),
);

/**
 * Keys that were renamed after boards had already been customised.
 *
 * The visible set lives in each user's localStorage, so a rename would silently
 * uncheck the field for everyone who had ever touched the Card fields menu —
 * they would read it as "the ARR disappeared from my board", not as a rename.
 * Honouring the old key on read costs one lookup and nothing else.
 */
const LEGACY_KEYS: Partial<Record<CardFieldKey, string>> = {
  // `expected_arr` was retired in favour of the MRR-derived `arr`; the card
  // field followed the column.
  potentialArr: 'expectedArr',
  // The single account owner split into a revenue and a delivery owner.
  // Only the revenue marker inherits the old key:
  // it is the one boards already had switched on, and the delivery marker is
  // genuinely new, so it ships off rather than appearing unasked.
  revenueOwner: 'owner',
  // `accountExecutive` needs no entry — it was retired outright, and rule 1 of
  // isFieldVisible already hides unknown keys, so stale stored sets carrying it
  // are inert.
};

function appliesTo(def: CardFieldDef, phase: PipelinePhase): boolean {
  return !def.phases || def.phases.includes(phase);
}

/** The fields worth offering for a phase, in render order. */
export function fieldsForPhase(phase: PipelinePhase): CardFieldDef[] {
  return PIPELINE_CARD_FIELDS.filter((f) => appliesTo(f, phase));
}

/** The default visible set for a phase — what the menu's Reset goes back to. */
export function defaultFieldsForPhase(phase: PipelinePhase): CardFieldKey[] {
  return fieldsForPhase(phase)
    .filter((f) => f.required || f.defaultVisible)
    .map((f) => f.key);
}

/**
 * The one question the card asks. Rules, in order:
 *
 * 1. Unknown key, or a field that means nothing in this phase → hidden.
 * 2. `required` → always shown, whatever the stored set says.
 * 3. `visible === null` (no provider — component tests, or any future consumer
 *    that renders a card outside the board) → fall back to the defaults.
 * 4. Otherwise the stored set decides.
 */
export function isFieldVisible(
  key: CardFieldKey,
  phase: PipelinePhase,
  visible: ReadonlySet<string> | null,
): boolean {
  const def = BY_KEY.get(key);
  if (!def || !appliesTo(def, phase)) return false;
  if (def.required) return true;
  if (visible === null) return def.defaultVisible;
  const legacy = LEGACY_KEYS[key];
  return visible.has(key) || (!!legacy && visible.has(legacy));
}
