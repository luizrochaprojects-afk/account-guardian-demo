import { useMemo } from 'react';
import { useListingPrefs } from '@/components/listing';
import {
  defaultFieldsForPhase,
  fieldsForPhase,
  type CardFieldDef,
  type CardFieldKey,
} from '@/lib/pipelineCardFields';
import type { PipelinePhase } from '@/lib/transitionStage';

export interface PipelineCardFieldsController {
  /** Fields worth offering for this phase, in render order. */
  fields: CardFieldDef[];
  /** The keys currently switched on. */
  visible: Set<string>;
  toggle: (key: string) => void;
  reset: () => void;
}

/**
 * Which card fields are visible, per phase, persisted per org.
 *
 * Reuses `useListingPrefs` — the same primitive behind the table pages' column
 * chooser — so the board does not grow a second, subtly different preferences
 * mechanism. Keys land in localStorage as
 * `pipeline.cardFields.<phase>:<orgId>:visibleColumns`.
 *
 * ⚠️ `useListingPrefs` hydrates exactly once. Changing `phase` changes the
 * storage key but does NOT re-read it, so the component that calls this hook
 * must be mounted with `key={phase}`; `PipelineCardFieldsProvider` does that.
 * Without it, switching phase silently inherits the previous phase's selection.
 */
export function usePipelineCardFields(
  phase: PipelinePhase,
  orgId: string | null | undefined,
): PipelineCardFieldsController {
  const fields = useMemo(() => fieldsForPhase(phase), [phase]);
  const defaults = useMemo(() => defaultFieldsForPhase(phase), [phase]);

  // Sort is part of the listing-prefs contract but means nothing for a board —
  // card order comes from the column's account list. A fixed key keeps the
  // stored value inert.
  const { visibleColumns, toggleColumn, resetColumns } = useListingPrefs<'none'>({
    pageKey: `pipeline.cardFields.${phase}`,
    orgId,
    defaultColumns: defaults,
    defaultSort: 'none',
  });

  return { fields, visible: visibleColumns, toggle: toggleColumn, reset: resetColumns };
}

export type { CardFieldKey };
